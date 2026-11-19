import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createRoomServer} from './index.mjs';
import {createMemoryStore} from './firestore.mjs';
import {createLegacyMigration} from './legacy-migration.mjs';

const quota=()=>Object.assign(new Error('Firestore quota or capacity limit reached.'),{status:429,code:'FIRESTORE_RESOURCE_EXHAUSTED',retryAfterSeconds:600});
async function fixture(t,data){
 const root=await mkdtemp(path.join(tmpdir(),'codejam-startup-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const filePath=path.join(root,'legacy.json');
 if(data){await writeFile(filePath,JSON.stringify(data));}
 return filePath;
}
async function listen(t,options){
 const server=await createRoomServer({nexconn:{},auth:{},ai:{configured:false},...options});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
 return `http://127.0.0.1:${server.address().port}`;
}

test('quota exhaustion does not block startup or liveness when there is no legacy file',async t=>{
 let reads=0,writes=0;
 const legacyFile=await fixture(t);
 const store={kind:'firestore',access:'server-iam',get:async()=>{reads++;throw quota();},put:async()=>{writes++;throw quota();}};
 const base=await listen(t,{store,legacyFile});
 const health=await fetch(base+'/health');assert.equal(health.status,200);assert.equal((await health.json()).legacyMigration,'not-needed');
 assert.equal((await fetch(base+'/auth/config')).status,200);
 assert.equal(reads,0);assert.equal(writes,0,'startup must not create a cloud migration marker');
 assert.equal((await fetch(base+'/rooms')).status,401,'membership checks still fail closed');
 const rooms=await fetch(base+'/rooms',{headers:{Authorization:'Bearer test-session'}});
 assert.equal(rooms.status,429);assert.equal((await rooms.json()).code,'FIRESTORE_RESOURCE_EXHAUSTED');
 assert.equal((await fetch(base+'/health')).status,200,'a database request failure must not terminate the server');
 assert.equal(reads,1);
});

test('legacy migration can be deferred without crashing or repeatedly querying Firestore',async t=>{
 const legacyFile=await fixture(t,{sessions:[],rooms:[]});let reads=0,signups=0;
 const base=await listen(t,{legacyFile,store:{kind:'firestore',get:async()=>{reads++;throw quota();}},auth:{password:async()=>{signups++;return {uid:'test'};}}});
 assert.equal((await (await fetch(base+'/health')).json()).legacyMigration,'pending');assert.equal(reads,0);
 const responses=await Promise.all(Array.from({length:3},()=>fetch(base+'/auth/password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'signup'})})));
 for(const response of responses){assert.equal(response.status,429);assert.equal(response.headers.get('Retry-After'),'600');await response.json();}
 assert.equal(reads,1,'concurrent requests must share a migration attempt and its cooldown');
 assert.equal(signups,0,'do not create a Firebase identity before a required migration is available');
 assert.equal((await (await fetch(base+'/health')).json()).legacyMigration,'deferred');assert.equal(reads,1);
});

test('legacy imports recover after quota reset, resume partial progress, and complete only once',async t=>{
 const filePath=await fixture(t,{sessions:[{tokenHash:'old-token-hash',id:'legacy-user',name:'Legacy User'}],rooms:[{id:'existing',name:'Old name',members:[]},{id:'new-room',name:'Imported room',members:[{id:'legacy-user',name:'Legacy User'}]}]});
 const memory=createMemoryStore();await memory.put('codejam_rooms','existing',{id:'existing',name:'Current name',members:[]});
 const writes=[];let clock=0,reject=true,markerReads=0;
 const store={...memory,kind:'firestore',async get(collection,id){if(collection==='codejam_meta'){markerReads++;}return memory.get(collection,id);},async put(collection,id,data){
  if(collection==='codejam_rooms'&&id==='new-room'&&reject){throw quota();}
  writes.push(collection+'/'+id);return memory.put(collection,id,data);
 }};
 const migration=await createLegacyMigration({store,filePath,clock:()=>clock});
 assert.equal(markerReads,0,'loading local data must not contact Firestore');
 await assert.rejects(migration.ensureReady(),e=>e.code==='FIRESTORE_RESOURCE_EXHAUSTED');
 assert.equal(await memory.get('codejam_meta','legacy-migration-v1'),null,'never mark a partial import complete');
 const before=markerReads;clock=300000;
 await assert.rejects(migration.ensureReady(),e=>e.retryAfterSeconds===300);assert.equal(markerReads,before);
 clock=600000;reject=false;
 await Promise.all([migration.ensureReady(),migration.ensureReady(),migration.ensureReady()]);
 assert.equal(migration.status,'complete');assert.equal(markerReads,before+1);
 assert.equal((await memory.get('codejam_rooms','existing')).name,'Current name');
 assert.deepEqual((await memory.get('codejam_rooms','new-room')).memberIds,['legacy-user']);
 assert.equal((await memory.get('codejam_sessions','old-token-hash')).isGuest,true);
 assert.equal(writes.filter(key=>key==='codejam_sessions/old-token-hash').length,1,'a retry must not overwrite imported sessions');
 assert.equal((await memory.get('codejam_meta','legacy-migration-v1')).importedRooms,2);
 await migration.ensureReady();assert.equal(markerReads,before+1,'completed imports never query the marker again');
});
