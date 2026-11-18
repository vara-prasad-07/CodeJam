import assert from 'node:assert/strict';
import { JSDOM, VirtualConsole } from 'jsdom';
import { readFile } from 'node:fs/promises';
import { randomBytes, webcrypto } from 'node:crypto';
import { createNexconnService } from '../server/nexconn.mjs';
import { createFirestoreStore } from '../server/firestore.mjs';
import { createRoomServer } from '../server/index.mjs';
const service=createNexconnService(),doms=[],clients=[],created=new Map(),accounts=[];
const db=createFirestoreStore(),prefix='verify_'+randomBytes(6).toString('hex')+'_';
const store={kind:'firestore',get:(c,id)=>db.get(prefix+c,id),list:(c,f)=>db.list(prefix+c,f),remove:(c,id)=>db.remove(prefix+c,id),async put(c,id,v,ver){created.set(c+'/'+id,[prefix+c,id]);return db.put(prefix+c,id,v,ver);}};
let server,base,room;
async function api(route,body,token){const r=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});const data=await r.json();assert.equal(r.status,200,data.error);return data;}
async function firebase(method,body){const r=await fetch('https://identitytoolkit.googleapis.com/v1/accounts:'+method+'?key='+encodeURIComponent(process.env.apiKey||process.env.FIREBASE_API_KEY),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await r.json();assert.ok(r.ok,'Firebase temporary account operation failed');return data;}
async function client(session) {
 const dom=new JSDOM('<!doctype html><div id="app"></div>',{url:'https://codejam.invalid',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:new VirtualConsole()});doms.push(dom);
 // Node WebSocket returns Node-realm binary buffers; use that realm for protobuf decoding.
 const w=dom.window;Object.assign(w,{fetch,WebSocket,TextEncoder,TextDecoder,ArrayBuffer,Uint8Array,Int8Array,Uint16Array,Int16Array,Uint32Array,Int32Array,Float32Array,Float64Array,DataView});Object.defineProperty(w,'crypto',{value:webcrypto});
 const pending=new Map(),received=[];let seq=0;
 w.eval(await readFile(new URL('../media/nexconn.js',import.meta.url),'utf8'));
 w.startNexconnBridge({postMessage(data){
  if(data.type==='sdkMessages'){received.push(...data.messages);}
  if(data.type==='sdkResult'){const entry=pending.get(data.requestId);if(entry){clearTimeout(entry.timer);pending.delete(data.requestId);data.ok?entry.resolve(data.data):entry.reject(new Error(data.error));}}
 }});
 async function call(command,input={}) {const requestId=String(++seq);return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(requestId);reject(new Error('Live SDK '+command+' timed out'));},22000);pending.set(requestId,{resolve,reject,timer});w.dispatchEvent(new w.MessageEvent('message',{data:{type:'sdkCommand',command,input,requestId}}));});}
 const api={call,received};clients.push(api);await call('connect',session);return api;
}
try {
 server=await createRoomServer({store,migrate:false});await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;
 const sessions=[];
 for(let i=0;i<2;i++){const email='codejam.verify.'+randomBytes(8).toString('hex')+'@example.com',password=randomBytes(20).toString('hex');const acct=await firebase('signUp',{email,password,returnSecureToken:true});accounts.push(acct.idToken);sessions.push(await api('/auth/password',{mode:'login',email,password}));}
 const [a,b]=sessions;console.log('Live project: Firebase email/password identities and durable app sessions verified');
 room=(await api('/rooms',{name:'Temporary project verification',repository:'verification',repositoryIdentity:'https://example.com/verify'},a.token)).room;
 await api('/rooms/join',{invite:room.invite},b.token);
 const ca=await client(await api('/chat/session',{},a.token)),cb=await client(await api('/chat/session',{},b.token));
 const sent=await ca.call('send',{channelId:room.channelId,text:'Please review this code',attachment:{path:'src/verify.ts',code:'export const verified = true;',line:1,endLine:1,branch:'main',commit:'verify'},mentions:[b.user.id],clientId:randomBytes(12).toString('hex')});
 const deadline=Date.now()+15000;while(!cb.received.some(m=>m.id===sent.id)&&Date.now()<deadline){await new Promise(r=>setTimeout(r,100));}assert.ok(cb.received.some(m=>m.id===sent.id));
 const source={...JSON.parse(JSON.stringify(sent)),userId:a.user.id,author:a.user.name};
 const discussion=(await api('/rooms/'+room.id+'/discussions',{source,title:'Verify exported flag'},a.token)).discussion;
 await cb.call('send',{channelId:room.channelId,text:'Reviewed the selected export',replyTo:sent.id,discussionId:discussion.id,clientId:randomBytes(12).toString('hex')});
 await api('/rooms/'+room.id+'/pins',{source,title:'Keep the verified export',discussionId:discussion.id},b.token);
 await api('/rooms/'+room.id+'/discussions/'+discussion.id,{status:'resolved'},b.token);
 await api('/rooms/'+room.id+'/reactions',{messageId:sent.id,emoji:'check'},b.token);
 const draft=await api('/rooms/'+room.id+'/draft',{context:{instruction:'Summarize only the supplied decision in two sentences.',messages:[{author:'Reviewer',text:'Keep the verified export.'}],code:source.attachment,diff:''}},a.token);assert.ok(draft.text.length>20);console.log('Live project: two Nexconn SDK clients, code discussion, decision, reaction, and Gemini draft verified');
 const ticket=await api('/rooms/'+room.id+'/call-ticket',{},a.token);const grant=await api('/calls/claim',{ticket:ticket.ticket});assert.ok(grant.callUserId.startsWith('ca'));assert.equal(grant.callUsers.length,2);console.log('Live project: separate Nexconn call identities and limited browser session verified (no audio call placed)');
 await new Promise(r=>server.close(r));server=await createRoomServer({store,migrate:false});await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;
 assert.ok((await api('/rooms',undefined,a.token)).rooms.some(r=>r.id===room.id));const details=await api('/rooms/'+room.id+'/details',undefined,b.token);assert.equal(details.pins.length,1);assert.equal(details.discussions[0].status,'resolved');assert.equal(details.reactions.length,1);
 const history=await cb.call('history',{channelId:room.channelId});assert.ok(history.messages.some(m=>m.discussionId===discussion.id));console.log('Live project: Firestore data survived backend restart; Nexconn thread history restored');
} catch(e){console.error(e.message);process.exitCode=1;}
finally {
 await Promise.allSettled(clients.map(c=>c.call('disconnect')));for(const dom of doms){dom.window.close();}
 if(room){await service.dismissGroup(room).catch(()=>{process.exitCode=1;});}
 for(const [c,id] of [...created.values()].reverse()){await db.remove(c,id).catch(()=>{process.exitCode=1;});}
 for(const idToken of accounts){await firebase('delete',{idToken}).catch(()=>{process.exitCode=1;});}
 if(server){await new Promise(r=>server.close(r));}console.log('Live project: temporary Firestore documents, Firebase accounts, and Nexconn group cleanup finished');process.exit(process.exitCode||0);
}
