import {test} from 'node:test';import assert from 'node:assert/strict';import {encodeFields,decodeFields,createFirestoreStore,createAdminTokenProvider} from './firestore.mjs';import {sanitizeContext,createAI} from './ai.mjs';
test('Firestore codec preserves nested records and the REST adapter uses update preconditions',async()=>{
 const value={text:'hello',flag:true,number:42,list:[1,'two',false],nested:{nil:null},_version:'not-data',missing:undefined};assert.deepEqual(decodeFields(encodeFields(value)),{text:'hello',flag:true,number:42,list:[1,'two',false],nested:{nil:null}});
 const requests=[];const store=createFirestoreStore({projectId:'test-project',getAccessToken:async()=>'admin-test-token',fetchImpl:async(url,options)=>{requests.push({url:String(url),...options});return {ok:true,status:200,json:async()=>({fields:encodeFields({id:'one'}),updateTime:'version2'})};}});
 await store.put('codejam_rooms','one',{id:'one'},'version1');assert.equal(new URL(requests[0].url).searchParams.get('currentDocument.updateTime'),'version1');assert.equal(requests[0].method,'PATCH');assert.equal(requests[0].headers.Authorization,'Bearer admin-test-token');assert.equal(new URL(requests[0].url).searchParams.has('key'),false);
});
test('AI refuses secret context and sends only the explicitly previewed inputs, without posting any message',async()=>{
 const context={instruction:'Draft a handoff',repository:'test',messages:[{author:'Vara',text:'Expiry is wrong'}],code:{path:'src/auth.ts',line:1,endLine:1,code:'return session;'},diff:''};
 assert.throws(()=>sanitizeContext({...context,code:{path:'.env',code:'secret'}}),/Secret files/);assert.throws(()=>sanitizeContext({...context,code:{path:'key.ts',code:'-----BEGIN PRIVATE KEY-----'}}),/credential/);
 const calls=[];const ai=createAI({apiKey:'server-only-key',model:'text-model',fetchImpl:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:'Draft for review'}]}}]})};}});
 const result=await ai.draft(context);assert.equal(result.text,'Draft for review');assert.equal(calls.length,1);const body=JSON.parse(calls[0].options.body);assert.deepEqual(JSON.parse(body.contents[0].parts[0].text),sanitizeContext(context));assert.ok(!calls[0].url.includes('server-only-key'));
});

test('AI answers general questions without project context and omits repository metadata',async()=>{
 const requests=[];
 const ai=createAI({apiKey:'test-provider-key',model:'test-model',fetchImpl:async(_url,options)=>{requests.push(JSON.parse(options.body));return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:'An LLM is a large language model.'}]}}]})};}});
 const result=await ai.draft({instruction:' What is an LLM? ',repository:'private/team-repo',messages:[],code:null,diff:''});
 assert.match(result.text,/large language model/);assert.equal(requests.length,1);
 assert.deepEqual(JSON.parse(requests[0].contents[0].parts[0].text),{instruction:'What is an LLM?',repository:'',messages:[],code:null,diff:''});
 const policy=requests[0].systemInstruction.parts[0].text;
 assert.match(policy,/general questions using general knowledge/);
 assert.match(policy,/project-specific question.*ask for the missing details/);
});

test('AI rejects blank questions and credentials before calling Gemini, including question-only requests',async()=>{
 let calls=0;const ai=createAI({apiKey:'test-key',model:'test-model',fetchImpl:async()=>{calls++;throw new Error('Provider should not be called');}});
 for(const instruction of ['', '   ', 'x'.repeat(2001), 'Please use -----BEGIN PRIVATE KEY-----']){
  await assert.rejects(ai.draft({instruction}),e=>e.status===400);
 }
 assert.equal(calls,0);
 assert.deepEqual(sanitizeContext({instruction:'Explain recursion',messages:[null,17,{}, {author:'A',text:'  '}],code:{path:'a.ts',code:' '},diff:' \n ',repository:'private/repo'}),{instruction:'Explain recursion',repository:'',messages:[],code:null,diff:''});
});


test('Admin OAuth refresh is cached, shared, and sanitized on credential errors',async()=>{
 let time=0,calls=0;
 const provider=createAdminTokenProvider({clock:()=>time,credential:{async getAccessToken(){calls++;return {access_token:'short-lived-'+calls,expires_in:3600};}}});
 assert.deepEqual(await Promise.all([provider(),provider(),provider()]),['short-lived-1','short-lived-1','short-lived-1']);assert.equal(calls,1);
 time=3539000;assert.equal(await provider(),'short-lived-1');time=3541000;assert.equal(await provider(),'short-lived-2');assert.equal(calls,2);
 const rejected=createAdminTokenProvider({credential:{getAccessToken:async()=>{throw new Error('private-key-content');}}});
 await assert.rejects(rejected(),error=>error.status===503&&!error.message.includes('private-key-content'));
});

test('Firestore fails closed when Admin credentials fail, never falling back to an API key',async()=>{
 let calls=0;
 const store=createFirestoreStore({projectId:'test-project',getAccessToken:async()=>{throw Object.assign(new Error('Admin not configured'),{status:503});},fetchImpl:async()=>{calls++;}});
 await assert.rejects(store.get('codejam_rooms','one'),/Admin not configured/);assert.equal(calls,0);
});


test('Firestore HTTP 400 version-precondition failures are conflicts, not service outages',async()=>{
 const store=createFirestoreStore({projectId:'test-project',getAccessToken:async()=>'test-token',fetchImpl:async()=>({ok:false,status:400,json:async()=>({error:{status:'FAILED_PRECONDITION'}})})});
 await assert.rejects(store.put('codejam_rooms','one',{id:'one'},'stale-version'),e=>e.status===409);
 await assert.rejects(store.put('codejam_rooms','one',{id:'one'}),e=>e.status===503);
});

test('Firestore quota errors preserve safe identifiers and advise backoff without exposing provider payloads',async()=>{
 const store=createFirestoreStore({projectId:'test-project',getAccessToken:async()=>'private-token',fetchImpl:async()=>({ok:false,status:429,json:async()=>({error:{status:'RESOURCE_EXHAUSTED',message:'private-provider-payload',details:[{'@type':'type.googleapis.com/google.rpc.ErrorInfo',metadata:{quota_metric:'firestore.googleapis.com/read_operations',quota_limit:'ReadOperationsPerDay',credential:'private-credential'}}]}})})});
 await assert.rejects(store.get('codejam_meta','marker'),e=>{
  assert.equal(e.status,429);assert.equal(e.code,'FIRESTORE_RESOURCE_EXHAUSTED');assert.equal(e.retryAfterSeconds,600);
  assert.deepEqual(e.quota,{metric:'firestore.googleapis.com/read_operations',limit:'ReadOperationsPerDay'});
  assert.match(e.message,/ReadOperationsPerDay/);assert.ok(!JSON.stringify(e).includes('private-'));return true;
 });
});

test('backend sends a machine-readable quota error and Retry-After to clients',async t=>{
 const {createRoomServer}=await import('./index.mjs');
 const failure=Object.assign(new Error('Firestore quota or capacity limit reached.'),{status:429,code:'FIRESTORE_RESOURCE_EXHAUSTED',retryAfterSeconds:600,quota:{limit:'ReadOperationsPerDay'}});
 const server=await createRoomServer({migrate:false,store:{get:async()=>{throw failure;}},auth:{password:async()=>({uid:'test'})},nexconn:{},ai:{}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const response=await fetch(`http://127.0.0.1:${server.address().port}/auth/password`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'login'})});
 assert.equal(response.status,429);assert.equal(response.headers.get('Retry-After'),'600');
 assert.deepEqual(await response.json(),{error:failure.message,code:failure.code,quota:failure.quota});
});
