import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRoomServer } from './index.mjs';

test('Nexconn token broker creates provider groups, joins members and persists metadata only', async t => {
 const directory=await mkdtemp(path.join(tmpdir(),'codejam-nexconn-'));const file=path.join(directory,'rooms.json');
 const calls=[];let rejected=false;
 const nexconn={session:async user=>{calls.push(['session',user.id]);return {appKey:'public-key',token:'user-access-token',userId:user.id,region:'SG'};},createGroup:async room=>{if(rejected){const e=new Error('Nexconn rejected request');e.status=502;throw e;}calls.push(['create',room.channelId,room.members[0].id]);},joinGroup:async(room,user)=>calls.push(['join',room.channelId,user.id])};
 let server,base;
 async function start(){server=await createRoomServer({file,nexconn});await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}`;}
 async function stop(){server.closeAllConnections();await new Promise(r=>server.close(r));}
 await start();t.after(async()=>{await stop();await rm(directory,{recursive:true,force:true});});
 const api=async(route,body,token,headers={})=>{const res=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});return {status:res.status,data:await res.json()};};
 const a=(await api('/sessions',{name:'Vara'})).data.token,b=(await api('/sessions',{name:'Aisha'})).data.token;
 assert.equal((await api('/health')).data.provider,'nexconn');
 assert.equal((await api('/rooms')).status,401);
 const chat=await api('/chat/session',{},a);assert.equal(chat.data.token,'user-access-token');assert.equal(chat.data.appSecret,undefined);
 const room=(await api('/rooms',{name:'CodeJam',repository:'repo'},a)).data.room;
 assert.match(room.channelId,/^[a-z0-9]+$/);assert.ok(calls.some(c=>c[0]==='create'&&c[1]===room.channelId));
 assert.equal((await api('/rooms',undefined,b)).data.rooms.length,0);
 assert.equal((await api('/rooms/join',{invite:'wrong'},b)).status,404);
 assert.equal((await api('/rooms/join',{invite:room.invite},b)).data.room.members.length,2);
 assert.equal((await api('/rooms/join',{invite:room.invite},b)).data.room.members.length,2);
 assert.ok(calls.some(c=>c[0]==='join'&&c[1]===room.channelId));
 assert.equal((await api(`/rooms/${room.id}/messages`,{text:'Must use SDK'},a)).status,404);
 assert.equal((await api('/rooms',undefined,a,{Origin:'https://untrusted.example'})).status,403);
 rejected=true;assert.equal((await api('/rooms',{name:'Failure',repository:'repo'},a)).status,502);assert.equal((await api('/rooms',undefined,a)).data.rooms.length,1);
 const disk=await readFile(file,'utf8');assert.ok(!disk.includes(a));assert.ok(!disk.includes('user-access-token'));assert.ok(!disk.includes('messages'));
 await stop();await start();assert.equal((await api('/rooms',undefined,b)).data.rooms[0].channelId,room.channelId);
});
