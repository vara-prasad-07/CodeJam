import http from 'node:http';
import { randomUUID, randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createNexconnService } from './nexconn.mjs';
import { createFirestoreStore } from './firestore.mjs';
import { createFirebaseAuth } from './auth.mjs';
import { createAI } from './ai.mjs';
import { createLegacyMigration } from './legacy-migration.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const fail=(status,message)=>{const error=new Error(message);error.status=status;throw error;};
const text=(value,max)=>typeof value==='string'&&value.trim().length>0&&value.length<=max;
const roomNameKey=name=>String(name).trim().replace(/\s+/g,' ').toLowerCase();
const roomOwner=room=>room.ownerId||room.members[0]?.id;
const duplicateRoom=()=>fail(409,'A room with this name already exists. Use a different name or ask its owner to delete the existing room.');
const now=()=>new Date().toISOString();
const language=value=>{if(value===undefined){return 'en';}if(!['en','hi','te'].includes(value)){fail(400,'Choose English, Hindi or Telugu.');}return value;};
const publicUser=user=>({id:user.id,name:user.name,email:user.email||'',isGuest:Boolean(user.isGuest),language:language(user.language)});
const safeName=name=>String(name||'Developer').trim().slice(0,60);
const cleanSource=(source,room)=>{
 if(!source||!text(source.id,200)||!text(source.userId,100)||!room.members.some(m=>m.id===source.userId)){fail(400,'Choose a valid message from this room.');}
 const result={id:source.id,userId:source.userId,author:room.members.find(m=>m.id===source.userId).name,text:String(source.text||'').slice(0,12000),createdAt:source.createdAt||now()};
 if(source.attachment){const a=source.attachment;if(!text(a.path,1000)||/(^[\\/]|^[a-z]:|(^|[\\/])\.\.([\\/]|$))/i.test(a.path)||typeof a.code!=='string'||a.code.length>12000||!Number.isInteger(a.line)||!Number.isInteger(a.endLine)||a.line<1||a.endLine<a.line){fail(400,'Invalid code reference.');}result.attachment={path:a.path,code:a.code,line:a.line,endLine:a.endLine,branch:String(a.branch||''),commit:String(a.commit||''),repository:String(a.repository||room.repositoryIdentity||'')};}
 if(source.voice){const v=source.voice;let url;try{url=new URL(v.url);}catch{fail(400,'Invalid voice message.');}if(url.protocol!=='https:'||url.username||url.password||v.url.length>4096||!Number.isFinite(v.duration)||v.duration<1||v.duration>60||v.mimeType!=='audio/wav'){fail(400,'Invalid voice message.');}result.voice={url:url.href,duration:v.duration,mimeType:v.mimeType};}
 return result;
};
export async function createRoomServer({store=createFirestoreStore(),nexconn=createNexconnService(),auth=createFirebaseAuth(),ai=createAI(),migrate=true,legacyFile=path.join(import.meta.dirname,'.data','nexconn-rooms.json'),allowGuests=process.env.CODEJAM_ALLOW_GUESTS==='true'}={}){
 const tickets=new Map(),loginRequests=new Map(),locks=new Map(),rates=new Map();
 async function locked(key,work){
  const previous=locks.get(key)||Promise.resolve(),task=previous.catch(()=>{}).then(work);
  locks.set(key,task);try{return await task;}finally{if(locks.get(key)===task){locks.delete(key);}}
 }
 async function mutate(collection,id,change){
  const key=collection+'/'+id,previous=locks.get(key)||Promise.resolve();
  const task=previous.catch(()=>{}).then(async()=>{for(let attempt=0;attempt<3;attempt++){const current=await store.get(collection,id);const updated=await change(current);try{return await store.put(collection,id,updated,current?._version);}catch(e){if(e.status!==409||attempt===2){throw e;}}}});
  locks.set(key,task);try{return await task;}finally{if(locks.get(key)===task){locks.delete(key);}}
 }
 const migration=await createLegacyMigration({store,filePath:legacyFile,enabled:migrate});
 async function issue(user,scope){const token=randomBytes(32).toString('hex');await store.put('codejam_sessions',hash(token),{...user,...scope,expiresAt:Date.now()+(scope?4*3600000:30*86400000)});return {token,user:publicUser(user)};}
 async function signedIn(identity,legacy){
  const existing=await store.get('codejam_accounts',identity.uid);
  const user=existing||{id:legacy?.isGuest?legacy.id:'cj'+hash(identity.uid).slice(0,30),name:safeName(identity.name||identity.email?.split('@')[0]),email:identity.email||'',firebaseUid:identity.uid,isGuest:false,language:'en'};
  const updated={...user,name:safeName(identity.name||user.name),email:identity.email||user.email,isGuest:false};
  await nexconn.session(updated);await store.put('codejam_accounts',identity.uid,updated);return issue(updated);
 }
 const publicRoom=room=>({id:room.id,channelId:room.channelId,name:room.name,ownerId:roomOwner(room),repository:room.repository,repositoryIdentity:room.repositoryIdentity||'',createdAt:room.createdAt,invite:room.invite,inviteExpiresAt:room.inviteExpiresAt,members:room.members,messages:[]});
 async function userFrom(req,refreshLanguage=false){const token=req.headers.authorization?.replace(/^Bearer /,'');if(!token||token.length>256){return null;}const session=await store.get('codejam_sessions',hash(token));if(!session||session.expiresAt<=Date.now()){return null;}const account=refreshLanguage&&session.firebaseUid?await store.get('codejam_accounts',session.firebaseUid):null;return {...session,language:language(account?.language??session.language)};}
 async function membership(id,user){const room=await store.get('codejam_rooms',id);if(!room?.members.some(m=>m.id===user.id)){fail(404,'Room not found or membership is required.');}if(user.scope==='call'&&user.roomId!==id){fail(403,'This call session belongs to another room.');}return room;}
 const browserConfig=()=>({apiKey:process.env.FIREBASE_API_KEY||process.env.apiKey,authDomain:process.env.FIREBASE_AUTH_DOMAIN||process.env.authDomain,projectId:process.env.FIREBASE_PROJECT_ID||process.env.projectId,appId:process.env.FIREBASE_APP_ID||process.env.appId});
 const callIdentity=user=>({id:'ca'+hash(user.id).slice(0,30),name:user.name});
 async function route(req,res){
  const url=new URL(req.url,'http://'+req.headers.host);const ownOrigin=(process.env.CODEJAM_PUBLIC_URL||url.origin).replace(/\/$/,'');
  if(req.headers.origin&&req.headers.origin!==ownOrigin){fail(403,'This browser origin is not allowed.');}
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  if(req.method==='GET'&&['/call','/signin','/call.js','/auth.js','/surface.css'].includes(url.pathname)){
   const files={'/call':['call.html','text/html'],'/signin':['signin.html','text/html'],'/call.js':['call.js','application/javascript'],'/auth.js':['auth.js','application/javascript'],'/surface.css':['surface.css','text/css']};const[file,type]=files[url.pathname];
   res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' https://apis.google.com; connect-src 'self' https: wss:; frame-src https://*.firebaseapp.com https://accounts.google.com; style-src 'self'; img-src 'self' https: data:; media-src 'self' blob:;");res.setHeader('Permissions-Policy','microphone=(self), camera=()');
   const data=await readFile(path.join(import.meta.dirname,'public',file));res.writeHead(200,{'Content-Type':type+'; charset=utf-8'});res.end(data);return undefined;
  }
  let body={};if(req.method==='POST'){let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>120000){fail(413,'Request exceeds the context limit.');}}try{body=JSON.parse(raw);}catch{fail(400,'Invalid JSON.');}if(!body||typeof body!=='object'||Array.isArray(body)){fail(400,'Expected a JSON object.');}}
  if(req.method==='GET'&&url.pathname==='/health'){return {provider:'nexconn',database:store.kind,databaseAccess:store.access||'test-only',aiConfigured:ai.configured,auth:'firebase',legacyMigration:migration.status};}
  if(req.method==='GET'&&url.pathname==='/auth/config'){return browserConfig();}
  // Small per-address limit for public authentication endpoints; no passwords or tokens are logged.
  if(req.method==='POST'&&/^\/(auth|sessions)/.test(url.pathname)){
   const key=req.socket.remoteAddress+url.pathname,bucket=rates.get(key)||{count:0,until:Date.now()+60000};if(bucket.until<Date.now()){bucket.count=0;bucket.until=Date.now()+60000;}if(++bucket.count>60){fail(429,'Too many sign-in attempts. Wait a minute and retry.');}rates.set(key,bucket);
  }
  // Gate database routes if a real legacy import is pending. Public health/config
  // and browser assets remain available, including while Firestore is unavailable.
  await migration.ensureReady();
  if(req.method==='POST'&&url.pathname==='/auth/password'){
   const identity=await auth.password(body.mode,{email:body.email,password:body.password,name:safeName(body.name)});return signedIn(identity,await userFrom(req));
  }
  if(req.method==='POST'&&url.pathname==='/auth/browser/start'){
   const id=randomBytes(24).toString('hex'),proof=randomBytes(24).toString('hex'),ticket=randomBytes(24).toString('hex');loginRequests.set(id,{proof,ticket,expiresAt:Date.now()+180000,legacy:await userFrom(req)});return {id,proof,ticket};
  }
  if(req.method==='POST'&&url.pathname==='/auth/browser/complete'){
   const entry=[...loginRequests.values()].find(e=>e.ticket===body.ticket&&e.expiresAt>Date.now());if(!entry||entry.result){fail(403,'This sign-in request expired. Start again from CodeJam.');}entry.result=await signedIn(await auth.google(body.idToken),entry.legacy);return {ok:true};
  }
  if(req.method==='POST'&&url.pathname==='/auth/browser/claim'){
   const entry=loginRequests.get(body.id);if(!entry||entry.expiresAt<Date.now()||typeof body.proof!=='string'||body.proof.length!==entry.proof.length||!timingSafeEqual(Buffer.from(body.proof),Buffer.from(entry.proof))){fail(403,'Sign-in request expired.');}if(!entry.result){return {pending:true};}loginRequests.delete(body.id);return entry.result;
  }
  if(req.method==='POST'&&url.pathname==='/sessions'){
   if(!allowGuests){fail(401,'Sign in with email/password or Google to use CodeJam.');}if(!text(body.name,60)){fail(400,'A display name is required.');}const user={id:'cj'+randomUUID().replaceAll('-',''),name:body.name.trim(),isGuest:true};await nexconn.session(user);return issue(user);
  }
  if(req.method==='POST'&&url.pathname==='/calls/claim'){
   const ticket=tickets.get(body.ticket);if(!ticket||ticket.expiresAt<Date.now()){fail(403,'Call link expired. Open the huddle from CodeJam again.');}tickets.delete(body.ticket);const room=await membership(ticket.roomId,ticket.user);const session=await issue(ticket.user,{scope:'call',roomId:room.id});await Promise.all(room.members.filter(m=>m.id!==ticket.user.id).map(m=>nexconn.session(callIdentity(m))));const nc=await nexconn.session(callIdentity(ticket.user));return {...nc,sessionToken:session.token,userId:ticket.user.id,callUserId:callIdentity(ticket.user).id,room:publicRoom(room),callUsers:room.members.map(m=>({...m,callUserId:callIdentity(m).id}))};
  }
  const user=await userFrom(req,url.pathname==='/rooms');if(!user){fail(401,'Sign in to CodeJam to continue.');}
  if(user.scope==='call'&&!/^\/rooms\/[^/]+\/(call(?:\/control)?|presence)$/.test(url.pathname)){fail(403,'This session is restricted to the call.');}
  if(req.method==='POST'&&url.pathname==='/auth/logout'){const token=req.headers.authorization.replace(/^Bearer /,'');await store.remove('codejam_sessions',hash(token));return {ok:true};}
  if(req.method==='POST'&&url.pathname==='/account/language'){
   const preferred=language(body.language);
   if(user.firebaseUid){await mutate('codejam_accounts',user.firebaseUid,account=>({...account,language:preferred}));}
   const token=req.headers.authorization.replace(/^Bearer /,'');await mutate('codejam_sessions',hash(token),session=>({...session,language:preferred}));
   return {user:publicUser({...user,language:preferred})};
  }
  if(req.method==='POST'&&url.pathname==='/chat/session'){return nexconn.session(user);}
  if(req.method==='GET'&&url.pathname==='/rooms'){
   const rooms=await store.list('codejam_rooms',{field:'memberIds',op:'ARRAY_CONTAINS',value:user.id});return {userId:user.id,user:publicUser(user),provider:'nexconn',aiConfigured:ai.configured,rooms:rooms.sort((a,b)=>a.createdAt.localeCompare(b.createdAt)).map(publicRoom)};
  }
  if(req.method==='POST'&&url.pathname==='/rooms'){
   if(!text(body.name,64)||!text(body.repository,200)){fail(400,'A room name (1–64 characters) and repository are required.');}
   const nameKey=roomNameKey(body.name),nameId=hash(nameKey),id=randomUUID();
   // Atomic reservation also protects against duplicate requests on different backend instances.
   try{await store.put('codejam_room_names',nameId,{roomId:id},null);}catch(error){if(error.status===409){duplicateRoom();}throw error;}
   let persisted=false;
   try{
    // Older rooms predate the name index; keep their names reserved as well.
    if((await store.list('codejam_rooms')).some(r=>roomNameKey(r.name)===nameKey)){duplicateRoom();}
   const room={id,ownerId:user.id,nameKey,channelId:'cj'+randomBytes(16).toString('hex'),name:body.name.trim(),repository:body.repository,repositoryIdentity:String(body.repositoryIdentity||'').slice(0,500),createdAt:now(),invite:'cdj-'+randomBytes(18).toString('hex'),inviteExpiresAt:Date.now()+7*86400000,members:[{id:user.id,name:user.name}],memberIds:[user.id]};await nexconn.createGroup(room);await store.put('codejam_rooms',room.id,room);persisted=true;return {room:publicRoom(room)};
   }finally{if(!persisted){await store.remove('codejam_room_names',nameId);}}
  }
  if(req.method==='POST'&&url.pathname==='/rooms/join'){
   if(!text(body.invite,200)){fail(400,'Invitation code is required.');}
   const[found]=await store.list('codejam_rooms',{field:'invite',value:body.invite.trim()});
   if(!found){fail(404,'Invitation expired or not found. Ask a room member for a fresh invitation.');}
   return locked('room/'+found.id,async()=>{
    const room=await store.get('codejam_rooms',found.id);
    if(!room||room.invite!==body.invite.trim()||room.inviteExpiresAt<Date.now()){fail(404,'Invitation expired or not found. Ask a room member for a fresh invitation.');}
    if(room.members.length>=50&&!room.memberIds.includes(user.id)){fail(400,'Room member limit reached.');}
    await nexconn.joinGroup(room,user);
    const joined=await mutate('codejam_rooms',room.id,current=>({...current,ownerId:roomOwner(current),members:current.members.some(m=>m.id===user.id)?current.members:[...current.members,{id:user.id,name:user.name}],memberIds:[...new Set([...current.memberIds,user.id])]}));return {room:publicRoom(joined)};
   });
  }
  const match=url.pathname.match(/^\/rooms\/([\w-]+)(?:\/(.*))?$/);if(!match){fail(404,'Endpoint not found.');}const id=match[1],resource=match[2]||'';
  if(req.method==='POST'&&['agent','draft'].includes(resource)){
   await membership(id,user);
   const answer=resource==='agent'?await ai.answer(body.context):await ai.draft(body.context);
   await membership(id,user);return answer;
  }
  return locked('room/'+id,async()=>{
  const room=await membership(id,user);const collection=kind=>'codejam_rooms/'+id+'/'+kind;
  async function deleteRoom(){
   await nexconn.dismissGroup(room);
   for(const kind of ['pins','discussions','presence','reactions','state','callControls']){
    await store.clear(collection(kind));
   }
   await store.remove('codejam_rooms',id);
   const nameId=hash(roomNameKey(room.name)),claim=await store.get('codejam_room_names',nameId);
   if(claim?.roomId===id){await store.remove('codejam_room_names',nameId);}
   for(const[key,ticket]of tickets){if(ticket.roomId===id){tickets.delete(key);}}
   return {ok:true};
  }
  if(req.method==='POST'&&resource==='delete'){
   if(roomOwner(room)!==user.id){fail(403,'Only the room owner can delete this room.');}
   return deleteRoom();
  }
  if(req.method==='POST'&&(resource==='leave'||resource==='members/remove')){
   const target=resource==='leave'?user.id:body.userId;
   if(resource==='members/remove'){
    if(roomOwner(room)!==user.id){fail(403,'Only the room owner can remove members.');}
    if(target===user.id){fail(400,'Use Exit room to leave your room.');}
   }
   if(!room.memberIds.includes(target)){fail(404,'Room member not found.');}
   const remaining=room.members.filter(m=>m.id!==target);
   if(!remaining.length){return deleteRoom();}
   const ownerId=roomOwner(room)===target?remaining[0].id:roomOwner(room);
   if(roomOwner(room)===target){await nexconn.transferAndLeave(room,ownerId);}
   else{await nexconn.leaveGroup(room,target);}
   const updated=await mutate('codejam_rooms',id,current=>({...current,ownerId,members:current.members.filter(m=>m.id!==target),memberIds:current.memberIds.filter(member=>member!==target),invite:'cdj-'+randomBytes(18).toString('hex'),inviteExpiresAt:Date.now()+7*86400000}));
   await store.remove(collection('presence'),target);
   await store.put(collection('callControls'),target,{id:target,action:'leave',createdAt:now()});
   const call=await store.get(collection('state'),'call');
   if(call){await mutate(collection('state'),'call',current=>({...current,participants:(current?.participants||[]).filter(p=>p.id!==target)}));}
   for(const[key,ticket]of tickets){if(ticket.roomId===id&&ticket.user.id===target){tickets.delete(key);}}
   return {room:publicRoom(updated)};
  }
  if(req.method==='POST'&&resource==='chat-membership'){await nexconn.joinGroup(room,user);return {ok:true};}
  if(req.method==='POST'&&resource==='invite'){const updated=await mutate('codejam_rooms',id,r=>({...r,invite:'cdj-'+randomBytes(18).toString('hex'),inviteExpiresAt:Date.now()+7*86400000}));return {room:publicRoom(updated)};}
  if(req.method==='GET'&&resource==='details'){
   const[pins,discussions,presence,reactions,call]=await Promise.all([store.list(collection('pins')),store.list(collection('discussions')),store.list(collection('presence')),store.list(collection('reactions')),store.get(collection('state'),'call')]);
   return {ownerId:roomOwner(room),members:room.members,invite:room.invite,inviteExpiresAt:room.inviteExpiresAt,pins,discussions,presence:presence.filter(p=>Date.now()-p.lastSeen<90000),reactions,call:call&&Date.now()-call.lastSeen<90000?call:null};
  }
  if(req.method==='POST'&&resource==='presence'){
   const focus=String(body.focus||'Working in the project').slice(0,180);await store.put(collection('presence'),user.id,{id:user.id,name:user.name,focus,lastSeen:Date.now()});return {ok:true};
  }
  if(req.method==='POST'&&resource==='pins'){
   if(!text(body.title,100)){fail(400,'Give the decision a title (up to 100 characters).');}const source=cleanSource(body.source,room),pin={id:hash(source.id).slice(0,32),title:body.title.trim(),text:String(body.text||source.text).slice(0,12000),source,discussionId:typeof body.discussionId==='string'?body.discussionId:'',createdAt:now(),pinnedBy:user.name,pinnedById:user.id};await store.put(collection('pins'),pin.id,pin);return {pin};
  }
  if(req.method==='POST'&&resource.startsWith('pins/')){const pinId=resource.split('/')[1];await store.remove(collection('pins'),pinId);return {ok:true};}
  if(req.method==='POST'&&resource==='discussions'){
   const source=cleanSource(body.source,room);if(!text(body.title,120)){fail(400,'Add a discussion title.');}const discussionId=hash(source.id).slice(0,24);const existing=await store.get(collection('discussions'),discussionId);if(existing){return {discussion:existing};}const discussion={id:discussionId,title:body.title.trim(),source,status:'open',createdAt:now(),createdBy:user.id,updatedAt:now()};await store.put(collection('discussions'),discussion.id,discussion);return {discussion};
  }
  if(req.method==='POST'&&resource.startsWith('discussions/')){
   const discussionId=resource.split('/')[1];if(!['open','resolved'].includes(body.status)){fail(400,'Choose open or resolved.');}const discussion=await mutate(collection('discussions'),discussionId,current=>{if(!current){fail(404,'Discussion not found.');}return {...current,status:body.status,updatedAt:now(),resolvedBy:body.status==='resolved'?user.name:''};});return {discussion};
  }
  if(req.method==='POST'&&resource==='reactions'){
   const allowed=['eyes','search','target','rocket','hands','check'];if(!text(body.messageId,200)||!allowed.includes(body.emoji)){fail(400,'Invalid reaction.');}const reaction=await mutate(collection('reactions'),hash(body.messageId).slice(0,32),current=>{const values=current?.values||{},members=values[body.emoji]||[];return {id:body.messageId,values:{...values,[body.emoji]:members.includes(user.id)?members.filter(v=>v!==user.id):[...members,user.id]}};});return {reaction};
  }
  if(req.method==='POST'&&resource==='call-ticket'){await store.remove(collection('callControls'),user.id);const ticket=randomBytes(32).toString('hex');tickets.set(ticket,{user:{id:user.id,name:user.name,email:user.email||''},roomId:id,expiresAt:Date.now()+60000});return {ticket};}
  if(req.method==='GET'&&resource==='call'){
   const[call,control]=await Promise.all([store.get(collection('state'),'call'),store.get(collection('callControls'),user.id)]);return {call:call&&Date.now()-call.lastSeen<90000?call:null,control};
  }
  if(req.method==='POST'&&resource==='call/control'){
   if(!['mute','leave'].includes(body.action)){fail(400,'Unknown call control.');}await store.put(collection('callControls'),user.id,{action:body.action,id:randomUUID(),createdAt:now()});return {ok:true};
  }
  if(req.method==='POST'&&resource==='call'){
   if(user.scope!=='call'){fail(403,'Call state must come from the call browser.');}
   const call=await mutate(collection('state'),'call',current=>{
    if(body.event==='leave'){return {...(current||{}),participants:(current?.participants||[]).filter(p=>p.id!==user.id),lastSeen:Date.now()};}
    if(!text(body.callId,200)){fail(400,'A Nexconn call ID is required.');}if(!['start','join','heartbeat'].includes(body.event)){fail(400,'Unknown call event.');}
    const old=current?.callId===body.callId?current:null,participants=(old?.participants||[]).filter(p=>p.id!==user.id&&Date.now()-p.lastSeen<90000);participants.push({id:user.id,name:user.name,muted:Boolean(body.muted),status:body.status==='connected'?'connected':'connecting',lastSeen:Date.now()});
    return {callId:body.callId,hostId:old?.hostId||user.id,startedAt:old?.startedAt||now(),participants,lastSeen:Date.now()};
   });return {call};
  }
  fail(404,'Endpoint not found.');
  });
 }
 const server=http.createServer(async(req,res)=>{try{const data=await route(req,res);if(!res.writableEnded){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(data));}}catch(error){if(!res.writableEnded){if(error.retryAfterSeconds){res.setHeader('Retry-After',String(error.retryAfterSeconds));}res.writeHead(error.status||500,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:error.status?error.message:'The server could not complete the request. Retry; check backend configuration if it persists.',...(error.code==='FIRESTORE_RESOURCE_EXHAUSTED'?{code:error.code,quota:error.quota}:{})}));}}});server.requestTimeout=60000;
 const cleanup=setInterval(()=>{for(const map of[tickets,loginRequests]){for(const[key,value]of map){if(value.expiresAt<Date.now()){map.delete(key);}}}for(const[key,value]of rates){if(value.until<Date.now()){rates.delete(key);}}},30000);cleanup.unref();server.on('close',()=>clearInterval(cleanup));return server;
}
export function listenAddress(env=process.env){return {port:Number(env.PORT||3000),host:env.HOST||(env.RENDER==='true'?'0.0.0.0':'127.0.0.1')};}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){try{const server=await createRoomServer();const {host,port}=listenAddress();server.listen(port,host,()=>console.log(`CodeJam API (Firestore + Nexconn): http://${host}:${port}`));server.on('error',error=>{console.error(error.code==='EADDRINUSE'?'Port already in use. Stop the old backend and run npm run server again.':error.message);process.exitCode=1;});}catch(error){console.error(error.message);process.exitCode=1;}}
