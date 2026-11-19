const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const {createRequire}=require('node:module');
const {RefreshPolicy}=require('../out/refreshPolicy.js');

async function host(t,{signedIn=true}={}){
 let clock=0,provider,poll,failure;
 const calls=[],views=[],commands=new Map();
 const secret=new Map(signedIn?[['codejam.session.nexconn.https://codejam-vdmp.onrender.com','test-session']]:[]);
 const disposable=()=>({dispose(){}});
 const store=()=>{const rows=new Map();return {get:(key,fallback)=>rows.has(key)?rows.get(key):fallback,update:async(key,value)=>rows.set(key,value)};};
 const context={subscriptions:[],extensionUri:{fsPath:'C:/test-extension'},workspaceState:store(),globalState:store(),secrets:{get:async key=>secret.get(key),store:async(key,value)=>secret.set(key,value),delete:async key=>secret.delete(key)}};
 const room={id:'room1',channelId:'group1',name:'Room',repository:'repo',members:[{id:'me',name:'Me'}],messages:[]};
 const makeView=()=>{
  let listener,visibility,disposed;const posts=[];
  const webview={options:{},cspSource:'vscode-resource:',asWebviewUri:uri=>'vscode-resource:'+uri.fsPath,onDidReceiveMessage(fn){listener=fn;return disposable();},async postMessage(data){
   posts.push(data);
   if(data.type==='sdkCommand'){
    const result=data.command==='history'?{messages:[],hasMore:false}:data.command==='send'?{id:'sent',channelId:'group1',userId:'me',text:data.input.text,createdAt:new Date().toISOString(),clientId:data.input.clientId}:{};
    queueMicrotask(()=>listener({type:'sdkResult',requestId:data.requestId,ok:true,data:result}));
   }
   return true;
  }};
  const view={webview,posts,visible:true,onDidDispose(fn){disposed=fn;return disposable();},onDidChangeVisibility(fn){visibility=fn;return disposable();},receive:data=>listener(data),setVisible(value){view.visible=value;visibility?.();},close:()=>disposed?.()};views.push(view);return view;
 };
 const vscode={workspace:{workspaceFolders:[{name:'repo',uri:{fsPath:'C:/test-repo'}}],getConfiguration:()=>({get:(_key,fallback)=>fallback}),registerTextDocumentContentProvider:disposable,onDidChangeWorkspaceFolders:disposable,onDidChangeConfiguration:disposable},window:{registerWebviewViewProvider(_id,value){provider=value;return disposable();}},commands:{registerCommand(id,fn){commands.set(id,fn);return disposable();},executeCommand:async()=>undefined},Uri:{joinPath:(root,...parts)=>({fsPath:path.join(root.fsPath,...parts)})}};
 const fakeFetch=async(url,options)=>{
  const route=new URL(url).pathname;calls.push(route);
  if(failure&&route.endsWith(failure.route)){return {ok:false,status:failure.status,headers:new Map([['Retry-After',String(failure.retryAfter||0)]]),json:async()=>({error:failure.message,code:failure.code})};}
  const data=route==='/rooms'?{userId:'me',user:{id:'me',name:'Me'},rooms:[room]}:route==='/chat/session'?{userId:'me',token:'sdk-token'}:route.endsWith('/details')?{pins:[],discussions:[],reactions:[],presence:[],call:null}:{ok:true};
  return {ok:true,status:200,json:async()=>data};
 };
 const module={exports:{}},builtRequire=createRequire(path.join(__dirname,'../out/extension.js'));
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../out/extension.js'),'utf8'),{module,exports:module.exports,require:name=>name==='vscode'?vscode:name==='./repository'?{detectRepository:async()=>({root:'C:/test-repo',name:'repo',identity:'repo',branch:'main'})}:name==='./refreshPolicy'?{RefreshPolicy:class extends RefreshPolicy{constructor(){super(()=>clock);}}}:builtRequire(name),console,fetch:fakeFetch,URL,AbortSignal,setTimeout,clearTimeout,setInterval(fn,ms){assert.equal(ms,30000);poll=fn;return 1;},clearInterval(){},Buffer,process});
 module.exports.activate(context);t.after(()=>{for(const item of context.subscriptions){item.dispose();}});
 const view=makeView();provider.resolveWebviewView(view);
 const until=async predicate=>{const deadline=Date.now()+2000;while(!predicate()){if(Date.now()>deadline){throw new Error('Timed out waiting for host queue');}await new Promise(resolve=>setTimeout(resolve,2));}};
 let serial=0;
 const drain=async()=>{const operation='barrier-'+serial++;view.receive({type:'testBarrier',operation});await until(()=>view.posts.some(p=>p.type==='result'&&p.operation===operation));};
 view.receive({type:'ready'});await drain();
 return {view,calls,drain,async tick(ms){clock+=ms;poll();await drain();},fail(value){failure=value;}};
}

test('background refresh reuses room metadata, stops while hidden, and resumes on visibility',async t=>{
 const h=await host(t);
 assert.equal(h.calls.filter(r=>r==='/rooms').length,1);
 assert.equal(h.calls.filter(r=>r.endsWith('/details')).length,1);
 await h.tick(30000);
 assert.equal(h.calls.filter(r=>r==='/rooms').length,1,'room listing is reused for a minute');
 assert.equal(h.calls.filter(r=>r.endsWith('/details')).length,2);
 await h.tick(30000);
 assert.equal(h.calls.filter(r=>r==='/rooms').length,2);
 h.view.setVisible(false);const before=h.calls.length;
 await h.tick(120000);assert.equal(h.calls.length,before,'hidden views must not use Firestore');
 h.view.setVisible(true);await h.drain();assert.ok(h.calls.length>before);
 assert.equal(h.view.posts.filter(p=>p.type==='sdkCommand'&&p.command==='connect').length,1);
});

test('quota failures pause polling across visibility changes; explicit retry remains available',async t=>{
 const h=await host(t);
 // Backward compatible with the currently hosted backend's generic 503 message.
 h.fail({route:'/details',status:503,message:'Firestore RESOURCE_EXHAUSTED. Check the configured project and database access.'});
 await h.tick(30000);const failed=h.calls.length;
 assert.match(h.view.posts.filter(p=>p.type==='state').at(-1).connection,/Background refresh is paused/);
 await h.tick(120000);assert.equal(h.calls.length,failed);
 h.view.setVisible(false);h.view.setVisible(true);await h.drain();assert.equal(h.calls.length,failed);
 h.fail(undefined);h.view.receive({type:'refresh',operation:'manual-retry'});await h.drain();
 assert.ok(h.calls.length>failed);assert.ok(h.view.posts.some(p=>p.type==='result'&&p.operation==='manual-retry'&&p.ok));
 const restored=h.calls.length;await h.tick(30000);assert.ok(h.calls.length>restored);
});

test('sign-in screen makes no repeated background database requests',async t=>{
 const h=await host(t,{signedIn:false});assert.equal(h.calls.length,0);
 await h.tick(600000);h.view.setVisible(false);h.view.setVisible(true);await h.drain();
 assert.equal(h.calls.length,0);
});

test('WebSocket messages and sends continue while metadata refresh is paused',async t=>{
 const h=await host(t);h.fail({route:'/details',status:429,code:'FIRESTORE_RESOURCE_EXHAUSTED',message:'Read quota reached',retryAfter:600});
 await h.tick(30000);const before=h.calls.length;
 h.view.receive({type:'sdkMessages',messages:[{id:'incoming',channelId:'group1',userId:'me',text:'Live message',createdAt:new Date().toISOString()}]});await h.drain();
 assert.ok(h.view.posts.filter(p=>p.type==='state').at(-1).rooms[0].messages.some(m=>m.id==='incoming'));
 h.view.receive({type:'send',roomId:'room1',text:'Still connected',operation:'send'});await h.drain();
 assert.ok(h.view.posts.some(p=>p.type==='sdkCommand'&&p.command==='send'));
 assert.equal(h.calls.length,before,'chat must not poll Firestore to send or receive');
});

test('quota backoff increases after repeated failures and respects Retry-After',()=>{
 let now=0;const policy=new RefreshPolicy(()=>now);
 policy.failed({status:429,code:'FIRESTORE_RESOURCE_EXHAUSTED'});
 now=599999;assert.equal(policy.canPoll,false);now=600000;assert.equal(policy.canPoll,true);
 policy.failed({status:429,code:'FIRESTORE_RESOURCE_EXHAUSTED'});
 now=1200000;assert.equal(policy.canPoll,false);now=1800000;assert.equal(policy.canPoll,true);
 policy.succeeded();policy.failed({status:503,retryAfterMs:300000});
 now+=60000;assert.equal(policy.canPoll,false);now+=240000;assert.equal(policy.canPoll,true);
});
