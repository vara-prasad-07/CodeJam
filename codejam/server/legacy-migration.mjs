import {readFile} from 'node:fs/promises';

// Legacy imports are optional local data. Never make HTTP startup depend on Firestore.
export async function createLegacyMigration({store,filePath,enabled=true,clock=Date.now}) {
 let legacy;
 if(enabled&&store.kind==='firestore') {
  try { legacy=JSON.parse(await readFile(filePath,'utf8')); }
  catch(error) { if(error.code!=='ENOENT'){throw error;} }
 }
 let complete=!legacy,running=null,failure=null,retryAt=0;

 async function run() {
  if(!await store.get('codejam_meta','legacy-migration-v1')) {
   for(const session of legacy.sessions||[]) {
    if(!await store.get('codejam_sessions',session.tokenHash)) {
     await store.put('codejam_sessions',session.tokenHash,{...session,isGuest:true,expiresAt:clock()+30*86400000});
    }
   }
   for(const room of legacy.rooms||[]) {
    if(!await store.get('codejam_rooms',room.id)) {
     await store.put('codejam_rooms',room.id,{...room,memberIds:room.members.map(member=>member.id),repositoryIdentity:room.repositoryIdentity||'',inviteExpiresAt:clock()+7*86400000});
    }
   }
   await store.put('codejam_meta','legacy-migration-v1',{completedAt:new Date(clock()).toISOString(),importedRooms:legacy.rooms?.length||0});
  }
  complete=true;failure=null;
 }

 return {
  get status() { return !legacy?'not-needed':complete?'complete':failure?'deferred':'pending'; },
  async ensureReady() {
   if(complete){return;}
   if(clock()<retryAt){failure.retryAfterSeconds=Math.max(1,Math.ceil((retryAt-clock())/1000));throw failure;}
   if(!running) {
    running=run().catch(error=>{
     const quota=error.code==='FIRESTORE_RESOURCE_EXHAUSTED'||error.status===429;
     const delay=Math.max(quota?600:60,Number(error.retryAfterSeconds)||0);
     error.retryAfterSeconds=delay;retryAt=clock()+delay*1000;failure=error;throw error;
    }).finally(()=>{running=null;});
   }
   await running;
  },
 };
}
