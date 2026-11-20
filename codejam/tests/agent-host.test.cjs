const {test}=require('node:test');
const assert=require('node:assert/strict');
const {AgentController}=require('../out/agentHost.js');
const code={path:'main.ts',line:1,endLine:1,code:'return value;',branch:'main',commit:'abc'};
function setup(){
 const posts=[],requests=[],published=[];let codeReads=0,diffReads=0,resolve,response={status:'answer',text:'A private explanation',model:'test-model'},delayed=false;
 let destination={room:{id:'r',members:[],messages:[],discussions:[]},repoRoot:'repo',userId:'me',repository:'private/repo',hasRepository:true,linked:true,authenticated:true};
 const controller=new AgentController({destination:()=>destination,readCode:()=>{codeReads++;return code;},readDiff:async()=>{diffReads++;return 'private diff';},request:async(id,context,signal)=>{requests.push({id,context,signal});if(delayed){return new Promise(r=>resolve=r);}return response;},publish:async(answer)=>published.push(answer),post:(view,data)=>posts.push({view,...data})});
 const ask=extra=>controller.ask('first',{operation:'op',roomId:'r',instruction:'Explain recursion',permissions:{},...extra});
 return {controller,posts,requests,published,ask,reads:()=>({codeReads,diffReads}),delay:()=>delayed=true,finish:value=>resolve(value||response),setResponse:value=>response=value,change:patch=>destination={...destination,...patch}};
}
test('direct requests are private, scoped to their requesting view, and read only explicitly enabled sources',async()=>{
 const h=setup();await h.ask({share:true});
 assert.deepEqual(h.reads(),{codeReads:0,diffReads:0});assert.equal(h.requests[0].context.repository,'');assert.equal(h.published.length,0);
 assert.equal(h.posts[0].view,'first');assert.equal(h.posts[0].status,'answer');assert.equal(h.posts[0].shared,false);
 await assert.rejects(h.controller.share('second','op'),/no longer available/);
 await h.controller.share('first','op');await h.controller.share('first','op');
 assert.equal(h.published[0].id,h.published[1].id,'transport retries use the same message ID');
});
test('enabled selection and diff are captured only on submission',async()=>{
 const h=setup();await h.ask({permissions:{code:true,diff:true}});
 assert.deepEqual(h.reads(),{codeReads:1,diffReads:1});assert.equal(h.requests[0].context.code.code,code.code);assert.equal(h.requests[0].context.diff,'private diff');
});
test('missing permissions and provider errors never publish a message',async()=>{
 const h=setup();h.setResponse({status:'needs_context',text:'Enable Recent messages',missingSources:['messages']});await h.ask();
 assert.equal(h.posts.at(-1).status,'needs_context');assert.equal(h.published.length,0);await assert.rejects(h.controller.share('first','op'),/no longer/);
 h.setResponse({text:'Unstructured answer'});await h.ask();assert.equal(h.posts.at(-1).status,'error');assert.equal(h.published.length,0);
});
test('room, account and checkout changes suppress late responses and sharing',async()=>{
 for(const patch of [{room:{id:'other'}},{userId:'other'},{repoRoot:'other'}]){
  const h=setup();h.delay();const pending=h.ask();await new Promise(r=>setImmediate(r));h.change(patch);h.finish();await pending;
  assert.equal(h.posts.length,0);assert.equal(h.published.length,0);await assert.rejects(h.controller.share('first','op'),/no longer/);
 }
});
test('permission revocation cancels a job and duplicate Enter does not generate twice',async()=>{
 const h=setup();h.delay();const first=h.ask();await new Promise(r=>setImmediate(r));await h.ask({operation:'duplicate'});assert.equal(h.requests.length,1);
 h.controller.cancel('first');assert.equal(h.requests[0].signal.aborted,true);h.finish();await first;
 assert.equal(h.posts.filter(p=>p.type==='agentResponse').length,0);assert.equal(h.posts[0].type,'agentCanceled');
});
test('bad destinations, blank questions, and unlinked context are rejected before reading',async()=>{
 const h=setup();await h.ask({instruction:''});await h.ask({roomId:'wrong'});h.change({linked:false});await h.ask({permissions:{code:true}});
 assert.deepEqual(h.reads(),{codeReads:0,diffReads:0});assert.equal(h.requests.length,0);assert.equal(h.posts.length,3);assert.ok(h.posts.every(p=>p.status==='error'));
});

test('destination changes during context capture prevent any model request',async()=>{
 const h=setup();const pending=h.ask({permissions:{code:true}});h.change({repoRoot:'another-checkout'});await pending;
 assert.equal(h.requests.length,0);assert.deepEqual(h.reads(),{codeReads:0,diffReads:0});
});
