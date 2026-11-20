import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAI,sanitizeAgentContext} from './ai.mjs';

const code={path:'src/main.ts',line:1,endLine:1,code:'return value;',branch:'main',commit:'abc'};
const context={instruction:'Explain this code based on our team discussion',permissions:{code:true,messages:false,diff:false},code,messages:[{author:'Peer',text:'Do not upload without permission'}],diff:'private diff'};
function setup(value={status:'answer',requiredSources:[],answer:'A general explanation.'},finishReason='STOP'){
 const calls=[];
 const ai=createAI({apiKey:'test-key',model:'test-model',fetchImpl:async(url,options)=>{
  calls.push({url,body:JSON.parse(options.body)});
  return {ok:true,json:async()=>({candidates:[{finishReason,content:{parts:[{text:typeof value==='string'?value:JSON.stringify(value)}]}}]})};
 }});return {ai,calls};
}

test('disabled sources are stripped on the server even if a client sends their contents',()=>{
 const safe=sanitizeAgentContext({...context,permissions:{code:'true',messages:false,diff:false},code:{path:'.env',code:'secret'}});
 assert.equal(safe.code,null);assert.deepEqual(safe.messages,[]);assert.equal(safe.diff,'');assert.equal(safe.repository,'');
 assert.deepEqual(safe.availability,{code:'disabled',messages:'disabled',diff:'disabled'});
});

test('the selected-code/team-discussion example is blocked before generating and never returns a partial answer',async()=>{
 const h=setup();const result=await h.ai.answer(context);
 assert.equal(result.status,'needs_context');assert.deepEqual(result.missingSources,['messages']);assert.match(result.text,/enable Recent messages/);assert.equal(h.calls.length,0);
});

test('all explicitly missing sources are reported together, including enabled but empty code',async()=>{
 const h=setup();const result=await h.ai.answer({...context,code:null,instruction:'Explain this code based on our team discussion and my local changes'});
 assert.equal(result.status,'needs_context');assert.deepEqual(result.missingSources,['code','messages','diff']);assert.match(result.text,/Select code/);assert.equal(h.calls.length,0);
});

test('general questions run with all permissions off and use structured JSON output',async()=>{
 const h=setup();const result=await h.ai.answer({instruction:'What is a vision model?',permissions:{}});
 assert.equal(result.status,'answer');assert.equal(h.calls.length,1);
 const body=h.calls[0].body,sent=JSON.parse(body.contents[0].parts[0].text);
 assert.deepEqual(sent.permissions,{code:false,messages:false,diff:false});assert.equal(sent.repository,'');assert.equal(sent.code,null);assert.deepEqual(sent.messages,[]);
 assert.equal(body.generationConfig.responseMimeType,'application/json');assert.ok(body.generationConfig.responseJsonSchema.required.includes('requiredSources'));
 assert.match(body.systemInstruction.parts[0].text,/untrusted data/);
});

test('semantic dependency results are gated, even if Gemini incorrectly includes a plausible answer',async()=>{
 const h=setup({status:'answer',requiredSources:['messages'],answer:'Invented team decision that must never be exposed'});
 const result=await h.ai.answer({instruction:'Recap what everyone agreed yesterday',permissions:{code:true},code});
 assert.equal(result.status,'needs_context');assert.match(result.text,/enable Recent messages/);assert.doesNotMatch(result.text,/Invented/);
 assert.deepEqual(JSON.parse(h.calls[0].body.contents[0].parts[0].text).messages,[]);
});

test('Gemini can decline insufficient enabled context without exposing its speculative text',async()=>{
 const h=setup({status:'needs_context',requiredSources:['messages'],answer:'Speculation'});
 const result=await h.ai.answer({instruction:'Recap the decision',permissions:{messages:true},messages:[{text:'Hello'}]});
 assert.equal(result.status,'needs_context');assert.match(result.text,/not enough/);assert.doesNotMatch(result.text,/Speculation/);
});

test('authorized empty Git diff is distinct from a missing checkout',async()=>{
 const h=setup({status:'answer',requiredSources:['diff'],answer:'There are no tracked local changes.'});
 const result=await h.ai.answer({instruction:'Summarize my local changes',permissions:{diff:true},diff:''});
 assert.equal(result.status,'answer');
 const unavailable=await h.ai.answer({instruction:'Summarize my local changes',permissions:{diff:true},availability:{diff:'missing'}});
 assert.equal(unavailable.status,'needs_context');assert.equal(h.calls.length,1);
});

test('malformed, truncated, unknown-source, blank and oversized answers fail closed',async()=>{
 for(const value of ['plain text','{',null,{status:'answer',requiredSources:['everything'],answer:'x'},{status:'answer',requiredSources:[],answer:''},{status:'answer',requiredSources:[],answer:'x'.repeat(12001)}]){
  const h=setup(value===null?'null':value);await assert.rejects(h.ai.answer({instruction:'Explain recursion',permissions:{}}),e=>e.status===502);
 }
 const h=setup({status:'answer',requiredSources:[],answer:'Partial'},'MAX_TOKENS');
 await assert.rejects(h.ai.answer({instruction:'Explain recursion',permissions:{}}),/could not complete/);
});

test('credentials and invalid questions fail before generation, even in the direct flow',async()=>{
 const h=setup();
 for(const instruction of ['', 'x'.repeat(2001), '-----BEGIN PRIVATE KEY-----']){await assert.rejects(h.ai.answer({instruction}),e=>e.status===400);}
 await assert.rejects(h.ai.answer({...context,code:{...code,path:'.env'}}),/Secret files/);
 assert.equal(h.calls.length,0);
});

test('conceptual questions and code supplied directly in the question need no project permission',async()=>{
 const h=setup();
 for(const instruction of ['How do team discussions help?', 'What does the diff command do?', 'Explain this code: `return 1;`']){
  assert.equal((await h.ai.answer({instruction,permissions:{}})).status,'answer');
 }
 assert.equal(h.calls.length,3);
});
