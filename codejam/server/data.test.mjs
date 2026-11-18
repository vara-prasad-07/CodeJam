import {test} from 'node:test';import assert from 'node:assert/strict';import {encodeFields,decodeFields,createFirestoreStore} from './firestore.mjs';import {sanitizeContext,createAI} from './ai.mjs';
test('Firestore codec preserves nested records and the REST adapter uses update preconditions',async()=>{
 const value={text:'hello',flag:true,number:42,list:[1,'two',false],nested:{nil:null},_version:'not-data',missing:undefined};assert.deepEqual(decodeFields(encodeFields(value)),{text:'hello',flag:true,number:42,list:[1,'two',false],nested:{nil:null}});
 const requests=[];const store=createFirestoreStore({projectId:'test-project',apiKey:'public-test',fetchImpl:async(url,options)=>{requests.push({url:String(url),...options});return {ok:true,status:200,json:async()=>({fields:encodeFields({id:'one'}),updateTime:'version2'})};}});
 await store.put('codejam_rooms','one',{id:'one'},'version1');assert.equal(new URL(requests[0].url).searchParams.get('currentDocument.updateTime'),'version1');assert.equal(requests[0].method,'PATCH');
});
test('AI refuses secret context and sends only the explicitly previewed inputs, without posting any message',async()=>{
 const context={instruction:'Draft a handoff',repository:'test',messages:[{author:'Vara',text:'Expiry is wrong'}],code:{path:'src/auth.ts',line:1,endLine:1,code:'return session;'},diff:''};
 assert.throws(()=>sanitizeContext({...context,code:{path:'.env',code:'secret'}}),/Secret files/);assert.throws(()=>sanitizeContext({...context,code:{path:'key.ts',code:'-----BEGIN PRIVATE KEY-----'}}),/credential/);assert.throws(()=>sanitizeContext({...context,messages:[],code:null}),/Select discussion/);
 const calls=[];const ai=createAI({apiKey:'server-only-key',model:'text-model',fetchImpl:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:'Draft for review'}]}}]})};}});
 const result=await ai.draft(context);assert.equal(result.text,'Draft for review');assert.equal(calls.length,1);const body=JSON.parse(calls[0].options.body);assert.deepEqual(JSON.parse(body.contents[0].parts[0].text),sanitizeContext(context));assert.ok(!calls[0].url.includes('server-only-key'));
});
