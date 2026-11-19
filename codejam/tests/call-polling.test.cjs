const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const {transformSync}=require('esbuild');
const {RefreshPolicy}=require('../out/refreshPolicy.js');
const source=transformSync(fs.readFileSync(path.join(__dirname,'../src/callPage.mts'),'utf8'),{loader:'ts',format:'cjs'}).code;

async function callBrowser(t){
 const dom=new JSDOM(fs.readFileSync(path.join(__dirname,'../server/public/call.html'),'utf8'),{url:'https://codejam.invalid/call',runScripts:'outside-only',pretendToBeVisual:true});t.after(()=>dom.window.close());
 const w=dom.window,requests=[],timers=new Map();let clock=0,hidden=false,events,failure;
 Object.defineProperty(w.document,'hidden',{get:()=>hidden});w.Date.now=()=>clock;
 w.setInterval=(fn,ms)=>{timers.set(ms,fn);return ms;};
 w.AbortSignal.timeout=()=>new w.AbortController().signal;
 const grant={appKey:'test-key',token:'test-token',region:'SG',sessionToken:'test-session',userId:'me',callUserId:'call-me',room:{id:'r',name:'Test room'},callUsers:[{id:'me',name:'Me',callUserId:'call-me'},{id:'peer',name:'Peer',callUserId:'call-peer'}]};
 w.sessionStorage.setItem('codejam.call',JSON.stringify(grant));
 w.fetch=async(route,options)=>{requests.push({route,method:options.method,body:options.body&&JSON.parse(options.body)});return failure?{ok:false,status:429,headers:new Map([['Retry-After','600']]),json:async()=>({error:'Firestore RESOURCE_EXHAUSTED',code:'FIRESTORE_RESOURCE_EXHAUSTED'})}:{ok:true,status:200,json:async()=>({call:null})};};
 const engine={setCallEventHandler:handler=>events=handler,setConnectionQualityHandler(){},enableMicrophone:async()=>({code:0}),endCall:async()=>({code:0})};
 const chat={NCEngine:{initialize(){},connect:async()=>({isOk:true})},AreaCode:{SG:'SG'},LogLevel:{ERROR:1}};
 const call={NCCallEngine:{install(){},initialize:()=>engine},NCCallType:{MULTI:1},NCCallMediaType:{AUDIO:1},NCCallLogLevel:{ERROR:1}};
 w.require=name=>name==='@nexconn/chat'?chat:name==='@nexconn/call'?call:{RefreshPolicy:class extends RefreshPolicy{constructor(){super(()=>clock);}}};
 w.exports={};w.module={exports:w.exports};
 const flush=async()=>{await new Promise(resolve=>setImmediate(resolve));};
 w.eval(source);await flush();
 return {w,requests,flush,async tick(ms){clock+=ms;timers.get(10000)();await flush();},async visibility(value){hidden=!value;w.document.dispatchEvent(new w.Event('visibilitychange'));await flush();},async join(){events.onCallConnected({session:{getCallId:()=> 'call1'}});await flush();},fail(){failure=true;}};
}

test('idle huddle browser polls at most every 30 seconds and pauses while hidden',async t=>{
 const h=await callBrowser(t);assert.equal(h.requests.length,1);
 await h.tick(10000);await h.tick(10000);assert.equal(h.requests.length,1);
 await h.tick(10000);assert.equal(h.requests.length,2);
 await h.visibility(false);await h.tick(60000);assert.equal(h.requests.length,2);
 await h.visibility(true);assert.equal(h.requests.length,3);
});

test('active audio retains hidden-tab checks with spaced heartbeats',async t=>{
 const h=await callBrowser(t);await h.join();await h.visibility(false);
 assert.equal(h.requests.filter(r=>r.method==='POST').length,1);
 await h.tick(30000);assert.equal(h.requests.filter(r=>r.method==='POST').length,2);
 const before=h.requests.length;await h.tick(10000);
 assert.equal(h.requests.length,before+1,'check remote controls without another heartbeat');
 await h.tick(10000);assert.equal(h.requests.filter(r=>r.method==='POST').length,3);
 assert.equal(h.w.document.querySelector('#mute').disabled,false);
});

test('huddle quota failure pauses automatic reads without ending SDK audio',async t=>{
 const h=await callBrowser(t);await h.join();h.fail();await h.tick(30000);
 const before=h.requests.length;await h.tick(300000);assert.equal(h.requests.length,before);
 assert.match(h.w.document.querySelector('#error').textContent,/RESOURCE_EXHAUSTED/);
 assert.equal(h.w.document.querySelector('#leave').disabled,false);
 await h.tick(300000);assert.equal(h.requests.length,before+1,'retry only after quota cooldown');
});
