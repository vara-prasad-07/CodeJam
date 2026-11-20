const {test}=require('node:test');
const assert=require('node:assert/strict');
const {buildAIContext}=require('../out/aiContext.js');
const root={id:'root',author:'Teammate',text:'Original blocker',userId:'peer',createdAt:'2026-11-20T00:00:00Z'};
const attachment={path:'src/main.ts',code:'return value;',line:1,endLine:1,branch:'main',commit:'abc'};
const room={id:'r',members:[],messages:[root],discussions:[],pins:[]};

test('a question with no opted-in context never reads a diff or includes attached code or repository identity',async()=>{
 let reads=0;
 for(const flag of [false,undefined,'false']){
  const result=await buildAIContext({instruction:' What is an LLM? ',attachment,includeCode:flag,includeMessages:flag,includeDiff:flag},room,'private/repo',async()=>{reads++;return 'private diff';});
  assert.deepEqual(result,{context:{instruction:'What is an LLM?',repository:'',messages:[],code:null,diff:''},warnings:[]});
 }
 assert.equal(reads,0);
});

test('asking about an older message includes that specific message rather than unrelated recent chat',async()=>{
 const recent=Array.from({length:30},(_,i)=>({...root,id:'m'+i,text:'Unrelated '+i}));
 const result=await buildAIContext({instruction:'Explain this',sourceId:'root',includeMessages:true},{...room,messages:[root,...recent]},'private/repo');
 assert.deepEqual(result.context.messages,[{author:'Teammate',text:'Original blocker'}]);
});

test('discussion context retains its root snapshot after history pagination and limits recent replies',async()=>{
 const messages=Array.from({length:30},(_,i)=>({...root,id:'m'+i,text:'Reply '+i,discussionId:'thread'}));
 const result=await buildAIContext({instruction:'Summarize the blocker',sourceId:'root',discussionId:'thread',includeMessages:true},{...room,messages,discussions:[{id:'thread',source:root}]},'repo');
 assert.equal(result.context.messages.length,20);assert.equal(result.context.messages[0].text,'Original blocker');
 assert.equal(result.context.messages.at(-1).text,'Reply 29');
});

test('unavailable optional sources warn and still permit a question-only request',async()=>{
 const result=await buildAIContext({instruction:'Explain git',includeMessages:true,includeCode:true,includeDiff:true},{...room,messages:[]},'private/repo',async()=> '');
 assert.equal(result.warnings.length,3);assert.equal(result.context.repository,'');assert.deepEqual(result.context.messages,[]);
});

test('blank prompts and stale source IDs fail before reading local Git data',async()=>{
 let reads=0;const diff=async()=>{reads++;return 'diff';};
 await assert.rejects(buildAIContext({instruction:' ',includeDiff:true},room,'repo',diff),/Enter a question/);
 await assert.rejects(buildAIContext({instruction:'Explain',sourceId:'missing',includeDiff:true},room,'repo',diff),/message is no longer available/);
 await assert.rejects(buildAIContext({instruction:'Explain',discussionId:'missing',includeDiff:true},room,'repo',diff),/discussion is no longer available/);
 assert.equal(reads,0);
});
