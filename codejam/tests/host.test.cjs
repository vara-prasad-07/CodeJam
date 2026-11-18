const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {createRequire}=require('node:module');

test('extension shares one SDK connection across views and sends exclusively through the SDK bridge',async t=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'codejam-host-'));t.after(()=>fs.rmSync(folder,{recursive:true,force:true}));
 const commands=new Map(),stores={workspace:new Map(),global:new Map(),secret:new Map([['codejam.session.nexconn.http://127.0.0.1:3000','application-session']])},views=[];let provider,room=null;
 const disposable=()=>({dispose(){}});
 const makeStore=store=>({get:(key,fallback)=>store.has(key)?store.get(key):fallback,update:async(key,value)=>store.set(key,value)});
 const context={subscriptions:[],extensionUri:{fsPath:folder},workspaceState:makeStore(stores.workspace),globalState:makeStore(stores.global),secrets:{get:async key=>stores.secret.get(key),store:async(key,value)=>stores.secret.set(key,value),delete:async key=>stores.secret.delete(key)}};
 const makeView=()=>{
  let listener,disposeListener;const posts=[];
  const webview={options:{},cspSource:'vscode-resource:',asWebviewUri:uri=>'vscode-resource:'+uri.fsPath,onDidReceiveMessage(fn){listener=fn;return disposable();},async postMessage(data){posts.push(data);if(data.type==='sdkCommand'){
   const result=data.command==='connect'?{userId:'me'}:data.command==='history'?{messages:[],hasMore:false}:data.command==='send'?{id:'sdk-ack',channelId:'group1',userId:'me',text:data.input.text,createdAt:new Date().toISOString(),clientId:data.input.clientId}:{};
   queueMicrotask(()=>listener({type:'sdkResult',requestId:data.requestId,ok:true,data:result}));
  }return true;}};
  const view={webview,posts,onDidDispose(fn){disposeListener=fn;return disposable();},receive:data=>listener(data),close:()=>disposeListener?.()};views.push(view);return view;
 };
 const vscode={ViewColumn:{One:1},workspace:{registerTextDocumentContentProvider:disposable,workspaceFolders:[{name:'repo',uri:{fsPath:folder}}],getConfiguration:()=>({get:(key,fallback)=>key==='displayName'?'Vara':fallback}),onDidChangeWorkspaceFolders:disposable,onDidChangeConfiguration:disposable},window:{registerWebviewViewProvider(_id,p){provider=p;return disposable();},createWebviewPanel(){return makeView();},showInformationMessage:async()=>undefined},commands:{registerCommand(id,fn){commands.set(id,fn);return disposable();},executeCommand:async()=>undefined},Uri:{joinPath:(root,...parts)=>({fsPath:path.join(root.fsPath,...parts)})}};
 const calls=[];const fakeFetch=async(url,options)=>{
  const route=new URL(url).pathname;calls.push(route);let data;
  if(route==='/sessions'){data={token:'application-session'};}
  else if(route==='/chat/session'){data={appKey:'public-key',token:'user-nexconn-token',userId:'me',region:'SG'};}
  else if(route==='/rooms'&&options.method==='POST'){room={id:'room1',channelId:'group1',name:'Room',repository:'repo',messages:[],members:[{id:'me',name:'Vara'}]};data={room};}
  else if(route.endsWith('/details')){data={pins:[],discussions:[],reactions:[],presence:[],call:null};}
  else if(route.endsWith('/chat-membership')){data={ok:true};}
  else if(route.endsWith('/presence')){data={ok:true};}
  else if(route==='/rooms'){data={userId:'me',rooms:room?[room]:[]};}
  else{throw new Error('Unexpected HTTP route '+route);}
  return {ok:true,json:async()=>data};
 };
 const module={exports:{}};const builtRequire=createRequire(path.join(__dirname,'../out/extension.js')); 
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../out/extension.js'),'utf8'),{module,exports:module.exports,require:name=>name==='vscode'?vscode:builtRequire(name),console,fetch:fakeFetch,URL,AbortSignal,setTimeout,clearTimeout,setInterval,clearInterval,Buffer,process});
 module.exports.activate(context);t.after(()=>{for(const item of context.subscriptions){item.dispose();}});
 const until=async predicate=>{const deadline=Date.now()+4000;while(!predicate()){if(Date.now()>deadline){throw new Error('Timed out waiting for extension bridge');}await new Promise(r=>setTimeout(r,10));}};
 const first=makeView();provider.resolveWebviewView(first);first.receive({type:'ready'});await until(()=>first.posts.some(p=>p.type==='state'&&p.connected));
 commands.get('codejam.openPanel')();const second=views.at(-1);second.receive({type:'ready'});await until(()=>second.posts.some(p=>p.type==='state'&&p.connected));
 assert.equal(views.flatMap(v=>v.posts).filter(p=>p.type==='sdkCommand'&&p.command==='connect').length,1);
 assert.ok(views.flatMap(v=>v.posts).filter(p=>p.type==='state').every(p=>!JSON.stringify(p).includes('user-nexconn-token')));
 second.receive({type:'createRoom',name:'Room',operation:'create'});await until(()=>second.posts.some(p=>p.type==='result'&&p.operation==='create'));
 second.receive({type:'send',roomId:'room1',text:'Through Nexconn',operation:'send1'});await until(()=>second.posts.some(p=>p.type==='result'&&p.operation==='send1'));
 assert.ok(first.posts.some(p=>p.type==='sdkCommand'&&p.command==='send'));
 assert.ok(!calls.some(route=>route.endsWith('/messages')));
 assert.equal(second.posts.filter(p=>p.type==='state').at(-1).rooms[0].messages[0].id,'sdk-ack');
 first.close();await until(()=>second.posts.some(p=>p.type==='sdkCommand'&&p.command==='connect'));
});
