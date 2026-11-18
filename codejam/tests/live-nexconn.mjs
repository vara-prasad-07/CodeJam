import assert from 'node:assert/strict';
import { JSDOM, VirtualConsole } from 'jsdom';
import { readFile } from 'node:fs/promises';
import { randomBytes, webcrypto } from 'node:crypto';
import { createNexconnService } from '../server/nexconn.mjs';

// Opt-in: creates two Nexconn test users and a temporary group using server/.env.
const service=createNexconnService(),doms=[],clients=[];
let room;
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
 const id=()=> 'cjsmoke'+randomBytes(8).toString('hex');
 const users=[{id:id(),name:'CodeJam SDK test A'},{id:id(),name:'CodeJam SDK test B'}];
 const sessions=await Promise.all(users.map(user=>service.session(user)));
 console.log('Live Nexconn: two user tokens issued');
 room={channelId:id(),name:'CodeJam SDK verification',members:users};
 await service.createGroup(room);await service.joinGroup(room,users[1]);console.log('Live Nexconn: group created and second user joined');
 const a=await client(sessions[0]),b=await client(sessions[1]);console.log('Live Nexconn: two real SDK clients connected');
 const ownerHistory=await a.call('history',{channelId:room.channelId});assert.ok(Array.isArray(ownerHistory.messages));console.log('Live Nexconn: creator group membership and history verified');
 const attachment={path:'src/example.ts',code:'export const verified = true;',line:1,endLine:1,branch:'main',commit:'test'};
 const sent=await a.call('send',{channelId:room.channelId,text:'CodeJam Nexconn SDK integration check',clientId:id(),attachment});
 assert.ok(sent.id);console.log('Live Nexconn: SDK send acknowledged');
 const deadline=Date.now()+15000;while(!b.received.some(m=>m.id===sent.id)&&Date.now()<deadline){await new Promise(r=>setTimeout(r,100));}
 const received=b.received.find(m=>m.id===sent.id);assert.ok(received,'Second SDK client did not receive the live message');assert.deepEqual(JSON.parse(JSON.stringify(received.attachment)),attachment);
 console.log('Live Nexconn: live receive and code context verified');
 const reply=await b.call('send',{channelId:room.channelId,text:'Reply from the second SDK client',replyTo:sent.id,clientId:id()});assert.equal(reply.replyTo,sent.id);
 const history=await b.call('history',{channelId:room.channelId});assert.ok(history.messages.some(m=>m.id===sent.id));assert.ok(history.messages.some(m=>m.id===reply.id));console.log('Live Nexconn: reply and cloud message history verified');
 await b.call('disconnect');
 const restored=await client(sessions[1]);const afterReload=await restored.call('history',{channelId:room.channelId});assert.ok(afterReload.messages.some(m=>m.id===sent.id));console.log('Live Nexconn: fresh SDK instance restored cloud history');
} catch(error) {console.error(error.message);process.exitCode=1;}
finally {
 await Promise.allSettled(clients.map(c=>c.call('disconnect')));
 if(room){try{await service.dismissGroup(room);console.log('Live Nexconn: temporary verification group removed');}catch{console.log('Live Nexconn: temporary group cleanup failed');process.exitCode=1;}}
 for(const dom of doms){dom.window.close();}
 // The browser SDK owns internal timers; all sockets have been disconnected above.
 process.exit(process.exitCode||0);
}
