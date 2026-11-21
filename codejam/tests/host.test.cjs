const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {createRequire}=require('node:module');

for(const legacyLanguageEndpoint of [false,true]) test('extension shares one SDK connection and keeps translation private'+(legacyLanguageEndpoint?' with an older backend':''),async t=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'codejam-host-'));t.after(()=>fs.rmSync(folder,{recursive:true,force:true}));
 let fakeRecorder;
 class FakeRecorder {
  available=true;
  constructor(_root,changed){this.changed=changed;fakeRecorder=this;}
  emit(){this.changed(this.state?{...this.state}:undefined,this.state?.phase==='preview'?'UklGRg==':undefined);}
  async start(destination){this.state={...destination,id:'local-voice',clientId:'stable-voice',phase:'recording',duration:2};this.emit();}
  async stop(){this.state.phase='preview';this.emit();}
  payload(id){assert.equal(id,this.state.id);return {state:{...this.state},base64:'UklGRg=='};}
  uploading(progress=0){Object.assign(this.state,{phase:'uploading',progress});this.emit();}
  retry(error){Object.assign(this.state,{phase:'preview',error});this.emit();}
  async cancel(){this.state=undefined;this.emit();}
  async dispose(){await this.cancel();}
 }
 const commands=new Map(),stores={workspace:new Map(),global:new Map(),secret:new Map([['codejam.session.nexconn.https://codejam-vdmp.onrender.com','application-session']])},views=[];let provider,room=null;
 const disposable=()=>({dispose(){}});
 const makeStore=store=>({get:(key,fallback)=>store.has(key)?store.get(key):fallback,update:async(key,value)=>store.set(key,value)});
 const context={subscriptions:[],extensionUri:{fsPath:folder},workspaceState:makeStore(stores.workspace),globalState:makeStore(stores.global),secrets:{get:async key=>stores.secret.get(key),store:async(key,value)=>stores.secret.set(key,value),delete:async key=>stores.secret.delete(key)}};
 const makeView=()=>{
  let listener,disposeListener;const posts=[];
  const webview={options:{},cspSource:'vscode-resource:',asWebviewUri:uri=>'vscode-resource:'+uri.fsPath,onDidReceiveMessage(fn){listener=fn;return disposable();},async postMessage(data){posts.push(data);if(data.type==='sdkCommand'){
   const result=data.command==='translate'?{text:'????????',language:data.input.language}:data.command==='connect'?{userId:'me'}:data.command==='history'?{messages:[],hasMore:false}:data.command==='sendVoice'?{id:'sdk-voice',channelId:'group1',userId:'me',text:'',voice:{url:'https://media.example/voice.wav',duration:2,mimeType:'audio/wav'},createdAt:new Date().toISOString(),clientId:data.input.clientId,replyTo:data.input.replyTo}:data.command==='send'?{id:'sdk-ack',channelId:'group1',userId:'me',text:data.input.text,createdAt:new Date().toISOString(),clientId:data.input.clientId}:{};
   queueMicrotask(()=>listener({type:'sdkResult',requestId:data.requestId,ok:true,data:result}));
  }return true;}};
  const view={webview,posts,onDidDispose(fn){disposeListener=fn;return disposable();},receive:data=>listener(data),close:()=>disposeListener?.()};views.push(view);return view;
 };
 const vscode={ViewColumn:{One:1},workspace:{registerTextDocumentContentProvider:disposable,workspaceFolders:[{name:'repo',uri:{fsPath:folder}}],getConfiguration:()=>({get:(key,fallback)=>key==='displayName'?'Vara':fallback}),onDidChangeWorkspaceFolders:disposable,onDidChangeConfiguration:disposable},window:{registerWebviewViewProvider(_id,p){provider=p;return disposable();},createWebviewPanel(){return makeView();},showInformationMessage:async()=>undefined},commands:{registerCommand(id,fn){commands.set(id,fn);return disposable();},executeCommand:async()=>undefined},Uri:{joinPath:(root,...parts)=>({fsPath:path.join(root.fsPath,...parts)})}};
 let language='en';const calls=[],pins=[];const fakeFetch=async(url,options)=>{
  const route=new URL(url).pathname;calls.push(route);let data;
  if(route==='/sessions'){data={token:'application-session'};}
  else if(route==='/account/language'){if(legacyLanguageEndpoint){return {ok:false,status:404,json:async()=>({error:'Endpoint not found.'})};}language=JSON.parse(options.body).language;data={user:{id:'me',name:'Vara',language}};}
  else if(route==='/chat/session'){data={appKey:'public-key',token:'user-nexconn-token',userId:'me',region:'SG'};}
  else if(route==='/rooms'&&options.method==='POST'){room={id:'room1',channelId:'group1',name:'Room',ownerId:'me',repository:'repo',messages:[],members:[{id:'me',name:'Vara'},{id:'other',name:'Teammate'}]};data={room};}
  else if(route.endsWith('/members/remove')){const body=JSON.parse(options.body);assert.equal(body.userId,'other');room={...room,members:room.members.filter(m=>m.id!==body.userId)};data={room:{...room,messages:[]}};}
  else if(route.endsWith('/leave')||route.endsWith('/delete')){room=null;data={ok:true};}
  else if(route.endsWith('/decisions')){
   const change=JSON.parse(options.body);
   assert.equal(change.action,'accept');assert.equal(options.method,'POST');
   const pin={id:change.id,title:change.title,text:change.text,status:'accepted',source:{id:'sdk-ack',text:'Through Nexconn',userId:'me',author:'Vara'},createdAt:new Date().toISOString(),pinnedBy:'Vara'};
   pins.push(pin);data={pin};
  }
  else if(route.endsWith('/details')){data={pins,discussions:[],reactions:[],presence:[],call:null};}
  else if(route.endsWith('/chat-membership')){data={ok:true};}
  else if(route.endsWith('/presence')){data={ok:true};}
  else if(route.endsWith('/agent')){const body=JSON.parse(options.body);assert.equal(body.context.instruction,'What is an LLM?');assert.equal(body.context.repository,'');assert.deepEqual(body.context.messages,[]);assert.equal(body.context.code,null);assert.equal(body.context.diff,'');assert.equal(body.context.permissions.code,false);assert.equal(body.context.permissions.messages,false);assert.equal(body.context.permissions.diff,false);data={status:'answer',text:'An LLM is a large language model.',model:'test-model'};}
  else if(route==='/rooms'){data={userId:'me',user:{id:'me',name:'Vara',language},rooms:room?[room]:[]};}
  else{throw new Error('Unexpected HTTP route '+route);}
  return {ok:true,json:async()=>data};
 };
 const module={exports:{}};const builtRequire=createRequire(path.join(__dirname,'../out/extension.js')); 
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../out/extension.js'),'utf8'),{module,exports:module.exports,require:name=>name==='vscode'?vscode:name==='./voice'?{VoiceRecorder:FakeRecorder}:builtRequire(name),console,fetch:fakeFetch,URL,AbortSignal,setTimeout,clearTimeout,setInterval,clearInterval,Buffer,process});
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
 second.receive({type:'translateMessage',roomId:'room1',id:'sdk-ack',language:'te',operation:'private-translation'});
 await until(()=>second.posts.some(p=>p.type==='result'&&p.operation==='private-translation'));
 assert.equal(second.posts.find(p=>p.type==='translation'&&p.operation==='private-translation').text,'????????');
 assert.equal(first.posts.some(p=>p.type==='translation'),false,'translations are only delivered to the requesting view');
 assert.equal(language,legacyLanguageEndpoint?'en':'te');assert.equal(second.posts.filter(p=>p.type==='state').at(-1).user.language,'te');
 assert.equal(calls.filter(route=>route==='/account/language').length,1);
 assert.equal(second.posts.find(p=>p.type==='result'&&p.operation==='private-translation').ok,true);
 if(legacyLanguageEndpoint){assert.equal(stores.global.get('codejam.translation.language.'+JSON.stringify(['https://codejam-vdmp.onrender.com','me'])),'te');}
 assert.equal(second.posts.filter(p=>p.type==='state').at(-1).rooms[0].messages[0].text,'Through Nexconn');
 const change={action:'accept',id:'proposal',title:'Accept jobs',text:'Workers can retry.'};
 second.receive({type:'updateDecision',roomId:'other-room',change,operation:'wrong-room'});
 await until(()=>second.posts.some(p=>p.type==='result'&&p.operation==='wrong-room'));
 assert.equal(second.posts.find(p=>p.operation==='wrong-room').ok,false);
 assert.equal(calls.some(route=>route.endsWith('/decisions')),false);
 second.receive({type:'updateDecision',roomId:'room1',change,operation:'accept-choice'});
 await until(()=>second.posts.some(p=>p.type==='result'&&p.operation==='accept-choice'));
 const accepted=second.posts.find(p=>p.operation==='accept-choice');
 assert.equal(accepted.decisionId,'proposal');assert.equal(accepted.roomId,'room1');
 assert.ok(first.posts.some(p=>p.type==='state'&&p.rooms[0]?.pins?.some(pin=>pin.status==='accepted')));
 second.receive({type:'askAgent',roomId:'room1',instruction:'What is an LLM?',permissions:{code:false,messages:false,diff:false},operation:'agent-question'});
 await until(()=>second.posts.some(p=>p.type==='agentResponse'&&p.operation==='agent-question'));
 const answer=second.posts.find(p=>p.type==='agentResponse'&&p.operation==='agent-question');assert.equal(answer.status,'answer');assert.equal(answer.shared,false);
 assert.equal(first.posts.some(p=>p.type==='agentResponse'),false,'the other view must not receive the private answer');
 assert.equal(views.flatMap(v=>v.posts).filter(p=>p.type==='sdkCommand'&&p.command==='send').length,1,'generation must not publish any message');
 second.receive({type:'voiceStart',replyTo:'sdk-ack',operation:'record'});await until(()=>second.posts.some(p=>p.type==='result'&&p.operation==='record'));
 assert.equal(fakeRecorder.state.roomId,'room1');assert.equal(fakeRecorder.state.replyTo,'sdk-ack');
 first.receive({type:'sendVoice',voiceId:'local-voice',operation:'wrong-owner'});await until(()=>first.posts.some(p=>p.type==='result'&&p.operation==='wrong-owner'));
 assert.equal(first.posts.find(p=>p.type==='result'&&p.operation==='wrong-owner').ok,false);
 assert.equal(views.flatMap(v=>v.posts).filter(p=>p.type==='sdkCommand'&&p.command==='sendVoice').length,0);
 second.receive({type:'voiceStop',voiceId:'local-voice',operation:'stop'});await until(()=>second.posts.some(p=>p.type==='result'&&p.operation==='stop'));
 second.receive({type:'sendVoice',voiceId:'local-voice',roomId:'forged-room',operation:'send-voice'});await until(()=>second.posts.some(p=>p.type==='result'&&p.operation==='send-voice'));
 const voiceSend=first.posts.find(p=>p.type==='sdkCommand'&&p.command==='sendVoice');assert.equal(voiceSend.input.channelId,'group1');assert.equal(voiceSend.input.clientId,'stable-voice');assert.equal(voiceSend.input.replyTo,'sdk-ack');
 assert.ok(second.posts.filter(p=>p.type==='state').at(-1).rooms[0].messages.some(m=>m.id==='sdk-voice'&&m.voice.duration===2));assert.equal(fakeRecorder.state,undefined);
 assert.ok(!calls.some(route=>route.endsWith('/messages')||route.includes('upload')),'voice transport must stay with Nexconn');
 second.receive({type:'shareAgent',answerId:'agent-question',operation:'share-answer'});
 await until(()=>second.posts.some(p=>p.type==='result'&&p.operation==='share-answer'));
 assert.equal(second.posts.find(p=>p.type==='result'&&p.operation==='share-answer').ok,true);
 const sharedAnswer=first.posts.filter(p=>p.type==='sdkCommand'&&p.command==='send').at(-1);assert.equal(sharedAnswer.input.agent.question,'What is an LLM?');assert.equal(sharedAnswer.input.clientId,'agent-question');
 second.receive({type:'removeMember',roomId:'room1',userId:'other',operation:'remove-member'});
 await until(()=>second.posts.some(p=>p.type==='result'&&p.operation==='remove-member'));
 let snapshot=second.posts.filter(p=>p.type==='state').at(-1);assert.equal(snapshot.rooms[0].members.length,1);assert.equal(snapshot.rooms[0].messages.length,2);
 second.receive({type:'leaveRoom',roomId:'room1',operation:'leave-room'});
 await until(()=>second.posts.some(p=>p.type==='result'&&p.operation==='leave-room'));
 snapshot=second.posts.filter(p=>p.type==='state').at(-1);assert.equal(snapshot.rooms.length,0);assert.equal(snapshot.active,undefined);assert.equal(snapshot.user.language,'te','preference survives room refresh with an older backend');
 second.receive({type:'createRoom',name:'Room',operation:'recreate'});await until(()=>second.posts.some(p=>p.type==='result'&&p.operation==='recreate'));
 second.receive({type:'deleteRoom',roomId:'room1',operation:'delete-room'});await until(()=>second.posts.some(p=>p.type==='result'&&p.operation==='delete-room'));
 assert.equal(second.posts.filter(p=>p.type==='state').at(-1).rooms.length,0);
 assert.ok(calls.includes('/rooms/room1/members/remove'));assert.ok(calls.includes('/rooms/room1/leave'));assert.ok(calls.includes('/rooms/room1/delete'));
 first.close();await until(()=>second.posts.some(p=>p.type==='sdkCommand'&&p.command==='connect'));
});
