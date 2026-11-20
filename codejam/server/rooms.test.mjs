import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoomServer, listenAddress } from './index.mjs';
import { createMemoryStore } from './firestore.mjs';
const setup=async(t)=>{
 const store=createMemoryStore(),calls=[];let rejectGroup=false;
 const nexconn={session:async user=>({appKey:'public-key',token:'nexconn-user-token',userId:user.id,region:'SG'}),createGroup:async room=>{if(rejectGroup){const e=new Error('Provider unavailable');e.status=502;throw e;}calls.push(['create',room.channelId]);},joinGroup:async(room,user)=>calls.push(['join',room.channelId,user.id])};
 const auth={password:async(_mode,{email,name})=>({uid:email.replace(/\W/g,''),email,name:name||email.split('@')[0]}),google:async token=>{if(token!=='valid-google-token'){const e=new Error('Invalid Firebase token');e.status=401;throw e;}return {uid:'google-user',email:'google@example.test',name:'Google User'};}};
 const ai={configured:true,draft:async context=>({text:'Private reviewed handoff for '+context.instruction,model:'test-model'})};
 let server,base;const start=async()=>{server=await createRoomServer({store,nexconn,auth,ai,migrate:false,allowGuests:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}`;};const stop=async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));};
 await start();t.after(stop);
 const api=async(route,body,token,headers={})=>{const response=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,data:await response.json()};};
 const login=async(email,name)=>{const result=await api('/auth/password',{mode:'signup',email,password:'example-password',name});assert.equal(result.status,200);return result.data;};
 return {api,login,store,calls,reject:()=>rejectGroup=true,restart:async()=>{await stop();await start();}};
};
test('Firebase accounts create/join real-provider rooms; persisted membership enforces room access',async t=>{
 const h=await setup(t),a=await h.login('vara@example.test','Vara'),b=await h.login('aisha@example.test','Aisha'),outsider=await h.login('other@example.test','Other');
 assert.equal((await h.api('/rooms')).status,401);assert.equal((await h.api('/health')).data.database,'test-memory');
 const room=(await h.api('/rooms',{name:'CodeJam',repository:'repo',repositoryIdentity:'github.com/team/repo'},a.token)).data.room;
 assert.match(room.channelId,/^[a-z0-9]+$/);assert.equal(h.calls[0][0],'create');assert.equal((await h.api('/rooms',undefined,b.token)).data.rooms.length,0);
 assert.equal((await h.api(`/rooms/${room.id}/details`,undefined,outsider.token)).status,404);
 assert.equal((await h.api(`/rooms/${room.id}/chat-membership`,{},outsider.token)).status,404);
 assert.equal((await h.api(`/rooms/${room.id}/chat-membership`,{},a.token)).status,200);
 assert.deepEqual(h.calls.at(-1),['join',room.channelId,a.user.id]);
 assert.equal((await h.api('/rooms/join',{invite:'wrong'},b.token)).status,404);
 assert.equal((await h.api('/rooms/join',{invite:room.invite},b.token)).data.room.members.length,2);
 assert.equal((await h.api('/rooms/join',{invite:room.invite},b.token)).data.room.members.length,2);
 assert.equal((await h.api(`/rooms/${room.id}/messages`,{text:'Must use SDK'},a.token)).status,404);
 assert.equal((await h.api('/rooms',undefined,a.token,{Origin:'https://untrusted.example'})).status,403);
 h.reject();assert.equal((await h.api('/rooms',{name:'Failure',repository:'repo'},a.token)).status,502);assert.equal((await h.api('/rooms',undefined,a.token)).data.rooms.length,1);
 await h.restart();assert.equal((await h.api('/rooms',undefined,b.token)).data.rooms[0].channelId,room.channelId);
 const nc=(await h.api('/chat/session',{},a.token)).data;assert.equal(nc.token,'nexconn-user-token');assert.equal(nc.appSecret,undefined);
});
test('discussions, decisions, reactions and presence persist, are scoped to membership, and survive restart',async t=>{
 const h=await setup(t),a=await h.login('vara@example.test','Vara'),b=await h.login('aisha@example.test','Aisha');
 const room=(await h.api('/rooms',{name:'Room',repository:'repo'},a.token)).data.room;await h.api('/rooms/join',{invite:room.invite},b.token);
 const source={id:'message1',userId:a.user.id,text:'Session expires',createdAt:new Date().toISOString(),attachment:{path:'src/auth.ts',line:42,endLine:42,code:'return session;',branch:'fix/session',commit:'abc123'}};
 const d=(await h.api(`/rooms/${room.id}/discussions`,{title:'Session expires after refresh',source},a.token)).data.discussion;
 const again=(await h.api(`/rooms/${room.id}/discussions`,{title:'Duplicate',source},a.token)).data.discussion;assert.equal(d.id,again.id);
 assert.equal((await h.api(`/rooms/${room.id}/pins`,{source,title:'Keep milliseconds',text:'Use a single time unit.',discussionId:d.id},b.token)).status,200);
 await Promise.all(Array.from({length:4},()=>h.api(`/rooms/${room.id}/reactions`,{messageId:source.id,emoji:'eyes'},b.token)));
 await h.api(`/rooms/${room.id}/reactions`,{messageId:source.id,emoji:'eyes'},b.token);
 await h.api(`/rooms/${room.id}/presence`,{focus:'src/auth.ts:42'},a.token);
 await h.api(`/rooms/${room.id}/discussions/${d.id}`,{status:'resolved'},b.token);await h.restart();
 const details=(await h.api(`/rooms/${room.id}/details`,undefined,a.token)).data;assert.equal(details.discussions[0].status,'resolved');assert.equal(details.pins[0].source.attachment.line,42);assert.equal(details.pins[0].pinnedBy,'Aisha');assert.deepEqual(details.reactions[0].values.eyes,[b.user.id]);assert.equal(details.presence[0].focus,'src/auth.ts:42');
 const bad={...source,attachment:{...source.attachment,path:'../outside'}};assert.equal((await h.api(`/rooms/${room.id}/pins`,{source:bad,title:'Bad'},a.token)).status,400);
 const renewed=(await h.api(`/rooms/${room.id}/invite`,{},a.token)).data.room;assert.notEqual(renewed.invite,room.invite);assert.equal((await h.api('/rooms/join',{invite:room.invite},b.token)).status,404);
});
test('browser login and call tickets are one-time, expire by scope, and never authorize unrelated rooms',async t=>{
 const h=await setup(t),a=await h.login('vara@example.test','Vara');const room=(await h.api('/rooms',{name:'Room',repository:'repo'},a.token)).data.room;
 const ticket=(await h.api(`/rooms/${room.id}/call-ticket`,{},a.token)).data.ticket;
 const grant=(await h.api('/calls/claim',{ticket})).data;assert.ok(grant.sessionToken);assert.notEqual(grant.callUserId,a.user.id);
 assert.equal((await h.api('/calls/claim',{ticket})).status,403);assert.equal((await h.api('/rooms',undefined,grant.sessionToken)).status,403);
 assert.equal((await h.api(`/rooms/${room.id}/call`,{event:'join',callId:'call123',status:'connected'},grant.sessionToken)).status,200);
 assert.equal((await h.api(`/rooms/${room.id}/call`,{event:'join',callId:'forged'},a.token)).status,403);
 const state=(await h.api(`/rooms/${room.id}/details`,undefined,a.token)).data.call;assert.equal(state.participants[0].id,a.user.id);
 const start=(await h.api('/auth/browser/start',{})).data;assert.equal((await h.api('/auth/browser/claim',{id:start.id,proof:'wrong'})).status,403);
 assert.equal((await h.api('/auth/browser/complete',{ticket:start.ticket,idToken:'valid-google-token'})).status,200);
 const result=(await h.api('/auth/browser/claim',{id:start.id,proof:start.proof})).data;assert.equal(result.user.email,'google@example.test');assert.equal((await h.api('/auth/browser/claim',{id:start.id,proof:start.proof})).status,403);
 const config=(await h.api('/auth/config')).data;assert.ok(!('NEXCONN_APP_SECRET'in config));
});


test('Render listens publicly on the platform port while local development stays on loopback',()=>{
 assert.deepEqual(listenAddress({RENDER:'true',PORT:'10000'}),{host:'0.0.0.0',port:10000});
 assert.deepEqual(listenAddress({}),{host:'127.0.0.1',port:3000});
 assert.deepEqual(listenAddress({RENDER:'true',HOST:'0.0.0.0',PORT:'4321'}),{host:'0.0.0.0',port:4321});
});


test('voice discussion snapshots retain audio metadata and reject unsafe media URLs',async t=>{
 const h=await setup(t),a=await h.login('voice@example.test','Voice');
 const room=(await h.api('/rooms',{name:'Voice room',repository:'repo'},a.token)).data.room;
 const source={id:'voice1',userId:a.user.id,text:'',voice:{url:'https://media.example/voice.wav',duration:2,mimeType:'audio/wav'}};
 const created=await h.api(`/rooms/${room.id}/discussions`,{title:'Discuss this recording',source},a.token);
 assert.equal(created.status,200);assert.deepEqual(created.data.discussion.source.voice,source.voice);
 await h.restart();const details=(await h.api(`/rooms/${room.id}/details`,undefined,a.token)).data;assert.deepEqual(details.discussions[0].source.voice,source.voice);
 for(const voice of [{...source.voice,url:'file:///private.wav'},{...source.voice,url:'https://user:secret@media.example/audio'},{...source.voice,duration:61}]){
  assert.equal((await h.api(`/rooms/${room.id}/discussions`,{title:'Invalid',source:{...source,id:'invalid',voice}},a.token)).status,400);
 }
});
