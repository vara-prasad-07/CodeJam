const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const vm=require('node:vm');
const {createRequire}=require('node:module');
const {referencePath,isWithin,checkoutKey,sameRepository,resolveReferenceFile,locateExcerpt}=require('../out/codeReference.js');
const {createMessage}=require('../out/model.js');

const excerpt='export function greet() {\n  return "hello";\n}';
const attachment={path:'src/utils.ts',line:2,endLine:4,code:excerpt,branch:'author-branch',commit:'author-commit',repository:'github.com/team/app'};
const invalidPaths=['','/etc/passwd','C:\\Users\\author\\app.ts','C:app.ts','\\\\server\\share\\app.ts','../app.ts','src/../../app.ts','src\\..\\app.ts','src/app.ts:stream','file:///app.ts','src/\0file','src//app.ts','src/./app.ts','src/app.ts.','src/app.ts '];

test('portable references normalize Windows separators and reject absolute, traversal, URI and alternate-stream paths',()=>{
 assert.equal(referencePath('src\\with space\\组件.ts'),'src/with space/组件.ts');
 assert.equal(referencePath('src/..config.ts'),'src/..config.ts');
 for(const filename of invalidPaths){assert.throws(()=>referencePath(filename),filename);}
 const room={messages:[]},user={id:'me',name:'Me'};
 for(const filename of invalidPaths){assert.throws(()=>createMessage({attachment:{...attachment,path:filename}},user,room),filename);}
 const message=createMessage({attachment:{...attachment,path:'src\\utils.ts',symbol:'greet'}},user,room);
 assert.equal(message.attachment.path,'src/utils.ts');assert.equal(message.attachment.symbol,'greet');
 assert.throws(()=>createMessage({attachment:{...attachment,endLine:Number.MAX_SAFE_INTEGER}},user,room));
});

test('matching handles moved lines, partial selections, Unicode and line endings without trimming code',()=>{
 assert.deepEqual(locateExcerpt('// other changes\r\n\r\n'+excerpt.replace(/\n/g,'\r\n'),attachment),{status:'matched',line:2,character:0,endLine:4,endCharacter:1});
 assert.deepEqual(locateExcerpt('const привет = "hello";', {code:'привет'}),{status:'matched',line:0,character:6,endLine:0,endCharacter:12});
 assert.deepEqual(locateExcerpt('// 🧑‍💻\nconst привет = "hello";', {code:'привет'}),{status:'matched',line:1,character:6,endLine:1,endCharacter:12});
 assert.equal(locateExcerpt(excerpt+'\n'+excerpt,attachment).status,'ambiguous');
 assert.equal(locateExcerpt(excerpt.replace('hello','changed'),attachment).status,'changed');
 assert.equal(locateExcerpt('  return "hello";', {code:'return "hello"; '}).status,'changed');
 assert.equal(locateExcerpt('    ',{code:'  '}).status,'changed');
});

test('checkout bindings distinguish rooms, accounts and backends; local folder names never imply shared Git identity',()=>{
 const key=checkoutKey('https://one','me','room');
 for(const args of [['https://two','me','room'],['https://one','other','room'],['https://one','me','other']]){assert.notEqual(checkoutKey(...args),key);}
 assert.equal(sameRepository('local:app','local:app'),false);assert.equal(sameRepository(undefined,undefined),false);
 assert.equal(sameRepository('github.com/team/app','github.com/team/app'),true);
 assert.equal(sameRepository('github.com/fork/app','github.com/team/app'),false);
});

test('file resolution stays within the real linked root, including junctions and same-prefix sibling directories',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'codejam-paths-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const project=path.join(root,'project'),outside=path.join(root,'project-outside');await fs.mkdir(project);await fs.mkdir(outside);
 await fs.writeFile(path.join(project,'hello.ts'),excerpt);await fs.writeFile(path.join(outside,'private.ts'),'private');
 assert.equal(isWithin(project,outside),false);assert.equal(isWithin(project,path.join(project,'..config.ts')),true);
 assert.equal((await resolveReferenceFile(project,'hello.ts')).status,'available');
 assert.equal((await resolveReferenceFile(project,'missing.ts')).status,'missing');
 assert.equal((await resolveReferenceFile(project,'folder/file.ts')).status,'missing');
 for(const filename of invalidPaths){assert.equal((await resolveReferenceFile(project,filename)).status,'invalid');}
 await fs.symlink(outside,path.join(project,'escape'),process.platform==='win32'?'junction':'dir');
 assert.equal((await resolveReferenceFile(project,'escape/private.ts')).status,'outside');
 await fs.mkdir(path.join(project,'directory.ts'));assert.equal((await resolveReferenceFile(project,'directory.ts')).status,'missing');
 await fs.writeFile(path.join(project,'large.ts'),Buffer.alloc(5*1024*1024+1));assert.equal((await resolveReferenceFile(project,'large.ts')).status,'too-large');
});

class Range {
 constructor(line,character,endLine,endCharacter){this.start={line,character};this.end={line:endLine,character:endCharacter};}
 contains(range){const index=p=>p.line*1000000+p.character;return index(this.start)<=index(range.start)&&index(this.end)>=index(range.end);}
}
const uri=(scheme,fsPath)=>({scheme,fsPath,toString(){return scheme==='file'?'file://'+fsPath:fsPath;}});
async function host(t,{identities=['github.com/team/app'],files=[excerpt],rooms=1,remote='github.com/team/app',noWorkspace=false}={}){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'codejam-reference-host-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const folders=await Promise.all(identities.map(async(_,i)=>{const folder=path.join(root,'machine-'+i,'my checkout');await fs.mkdir(path.join(folder,'src'),{recursive:true});if(files[i]!==null){await fs.writeFile(path.join(folder,'src/utils.ts'),files[i]??excerpt);}return folder;}));
 const folderRepos=new Map(folders.map((folder,i)=>[folder,{root:folder,name:'app',identity:identities[i],detected:!identities[i].startsWith('local:'),branch:'teammate',commit:'teammate-commit',stack:'TypeScript'}]));
 const workspaceFolders=noWorkspace?[]:folders.map(folder=>({name:path.basename(folder),uri:uri('file',folder)}));
 const source={id:'shared',userId:'author',author:'Author',createdAt:new Date().toISOString(),text:'Review greet',attachment:{...attachment}};
 const roomRows=Array.from({length:rooms},(_,i)=>({id:'room'+i,name:'Room '+i,channelId:'channel'+i,repository:'app',repositoryIdentity:remote,members:[{id:'author',name:'Author'},{id:'me',name:'Me'}],messages:[]}));
 const stores={workspace:new Map(),global:new Map(),secrets:new Map([['codejam.session.nexconn.https://codejam-vdmp.onrender.com','token']])};
 const store=map=>({get:(key,fallback)=>map.has(key)?map.get(key):fallback,update:async(key,value)=>map.set(key,value)});
 const context={subscriptions:[],extensionUri:uri('file',root),workspaceState:store(stores.workspace),globalState:store(stores.global),secrets:{get:async key=>stores.secrets.get(key),store:async(key,value)=>stores.secrets.set(key,value),delete:async key=>stores.secrets.delete(key)}};
 const commands=[],shown=[],opened=[],providers=new Map(),documents=new Map();let provider,receive,pick=folders[0],symbols;
 const disposable=()=>({dispose(){}}),posts=[];
 const webview={cspSource:'vscode-resource:',options:{},asWebviewUri:value=>value.toString(),onDidReceiveMessage(fn){receive=fn;return disposable();},async postMessage(data){posts.push(data);if(data.type==='sdkCommand'){queueMicrotask(()=>receive({type:'sdkResult',requestId:data.requestId,ok:true,data:data.command==='history'?{messages:[],hasMore:false}:data.command==='connect'?{userId:'me'}:{}}));}return true;}};
 const makeDocument=(value,text)=>({uri:value,version:1,lineCount:text.split('\n').length,getText:()=>text,lineAt:n=>({text:text.split('\n')[n]||''})});
 const vscode={Range,SymbolKind:{Function:11,Method:5,Constructor:8},Uri:{file:filename=>uri('file',filename),parse:value=>uri(value.split(':')[0],value),joinPath:(base,...parts)=>uri('file',path.join(base.fsPath,...parts))},workspace:{workspaceFolders,registerTextDocumentContentProvider(scheme,value){providers.set(scheme,value);return disposable();},getConfiguration:()=>({get:(_key,fallback)=>fallback}),onDidChangeWorkspaceFolders:disposable,onDidChangeConfiguration:disposable,async openTextDocument(value){const target=typeof value==='string'?uri('file',value):value;opened.push(target);if(target.scheme==='codejam-snapshot'){return makeDocument(target,providers.get(target.scheme).provideTextDocumentContent(target));}if(documents.has(target.fsPath)){return documents.get(target.fsPath);}return makeDocument(target,await fs.readFile(target.fsPath,'utf8'));}},window:{registerWebviewViewProvider(_id,value){provider=value;return disposable();},async showTextDocument(document,options){shown.push({document,options});},async showQuickPick(items){return items.find(item=>item.folder===pick)||items.find(item=>item.folder==='');},async showOpenDialog(){return pick?[uri('file',pick)]:undefined;}},commands:{registerCommand:disposable,async executeCommand(command,...args){commands.push({command,args});return command==='vscode.executeDocumentSymbolProvider'?symbols:undefined;}}};
 const fakeFetch=async(url)=>{const route=new URL(url).pathname;const data=route==='/rooms'?{userId:'me',user:{id:'me',name:'Me'},rooms:roomRows}:route==='/chat/session'?{userId:'me',token:'sdk'}:route.endsWith('/details')?{discussions:[{id:'discussion',source,title:'Review code',status:'open'}],pins:[],presence:[],call:null}:{ok:true};return {ok:true,json:async()=>data};};
 const module={exports:{}},builtRequire=createRequire(path.join(__dirname,'../out/extension.js'));
 vm.runInNewContext(readFileSync(path.join(__dirname,'../out/extension.js'),'utf8'),{module,exports:module.exports,require:name=>name==='vscode'?vscode:name==='./repository'?{detectRepository:async folder=>folderRepos.get(folder)||{root:folder,name:'external',identity:'local:external',branch:'Local folder',commit:'',detected:false},readGitDiff:async()=>''}:builtRequire(name),console,fetch:fakeFetch,URL,AbortSignal,setTimeout,clearTimeout,setInterval,clearInterval,Buffer,process});
 module.exports.activate(context);t.after(()=>{for(const entry of context.subscriptions){entry.dispose();}});
 provider.resolveWebviewView({webview,onDidDispose:disposable,onDidChangeVisibility:disposable,visible:true});
 const until=async predicate=>{const deadline=Date.now()+4000;while(!predicate()){if(Date.now()>deadline){throw new Error('Timed out waiting for code reference host');}await new Promise(resolve=>setTimeout(resolve,2));}};
 let serial=0;const action=async(type,extra={})=>{const operation='action'+serial++;receive({type,operation,...extra});await until(()=>posts.some(p=>p.type==='result'&&p.operation===operation));const result=posts.find(p=>p.type==='result'&&p.operation===operation);assert.equal(result.ok,true,posts.filter(p=>p.type==='notice').at(-1)?.text);};
 await action('ready');
 return {root,folders,source,roomRows,posts,shown,opened,commands,documents,stores,vscode,action,state:()=>posts.filter(p=>p.type==='state').at(-1),pick:folder=>pick=folder,symbols:value=>symbols=value,makeDocument};
}

test('teammates open the matching function at its new line in a different absolute folder and commit',async t=>{
 const h=await host(t,{files:['// local additions\r\n\r\n'+excerpt.replace(/\n/g,'\r\n')]});
 assert.equal(h.state().linked,true);await h.action('openFile',{id:'shared',roomId:'room0'});
 const opened=h.shown.at(-1);assert.equal(opened.document.uri.fsPath,path.join(h.folders[0],'src/utils.ts'));
 assert.equal(opened.options.selection.start.line,2);assert.equal(opened.options.selection.end.line,4);
 assert.equal(h.posts.filter(p=>p.type==='referenceStatus').at(-1).status,'relocated');
 assert.equal(h.shown.some(s=>s.document.uri.scheme==='codejam-snapshot'),false);
});

test('forks explicitly link once, remember the local folder, and keep mappings separate for multiple rooms',async t=>{
 const h=await host(t,{identities:['github.com/alice/fork','github.com/bob/fork'],rooms:2});
 assert.equal(h.state().linked,false);await h.action('openFile',{id:'shared'});assert.equal(h.shown.at(-1).document.getText(),excerpt);
 assert.equal(h.opened.some(value=>value.scheme==='file'),false,'unlinked references must not read a local file');
 h.pick(h.folders[1]);await h.action('linkRoom');assert.equal(h.state().linked,true);await h.action('openFile',{id:'shared'});
 assert.equal(h.shown.at(-1).document.uri.fsPath,path.join(h.folders[1],'src/utils.ts'));
 await h.action('switchRoom',{id:'room1'});assert.equal(h.state().linked,false);
 h.pick(h.folders[0]);await h.action('linkRoom');await h.action('switchRoom',{id:'room0'});
 assert.equal(h.state().repo.root,h.folders[1]);assert.equal(h.state().linked,true);
 const bindings=h.stores.workspace.get('codejam.checkouts');assert.equal(Object.keys(bindings).length,2);
 await h.action('refresh');assert.equal(h.state().repo.root,h.folders[1]);
});

test('missing files inspect quietly and open a read-only saved snapshot without a filesystem error',async t=>{
 const h=await host(t,{files:[null]});await h.action('inspectReference',{id:'shared'});
 assert.equal(h.shown.length,0);assert.equal(h.posts.filter(p=>p.type==='referenceStatus').at(-1).reason,'missing');
 await h.action('openFile',{id:'shared'});const opened=h.shown.at(-1);
 assert.equal(opened.document.uri.scheme,'codejam-snapshot');assert.equal(opened.document.getText(),excerpt);assert.match(opened.document.uri.toString(),/utils\.shared\.ts$/);
 assert.doesNotMatch(h.posts.filter(p=>p.type==='notice').at(-1).text,/ENOENT|realpath/);
});

for(const [reason,text] of [['changed',excerpt.replace('hello','different')],['ambiguous',excerpt+'\n'+excerpt]]) test(reason+' local code opens the original snapshot and only compares the local file on explicit request',async t=>{
 const h=await host(t,{files:[text]});await h.action('openFile',{id:'shared'});
 assert.equal(h.shown.at(-1).document.uri.scheme,'codejam-snapshot');assert.equal(h.posts.filter(p=>p.type==='referenceStatus').at(-1).reason,reason);
 assert.equal(h.commands.some(c=>c.command==='vscode.diff'),false);await h.action('showDiff',{id:'shared'});
 const diff=h.commands.find(c=>c.command==='vscode.diff');assert.equal(diff.args[0].scheme,'codejam-snapshot');assert.equal(diff.args[1].fsPath,path.join(h.folders[0],'src/utils.ts'));
 assert.equal(await fs.readFile(path.join(h.folders[0],'src/utils.ts'),'utf8'),text,'opening and diffing must never modify the checkout');
});

test('no workspace still opens snapshots and can link an external local project without opening a new VS Code window',async t=>{
 const h=await host(t,{noWorkspace:true});assert.equal(h.state().repo,undefined);
 await h.action('openFile',{id:'shared'});assert.equal(h.shown.at(-1).document.uri.scheme,'codejam-snapshot');
 h.pick(h.folders[0]);await h.action('linkRoom');await h.action('refresh');assert.equal(h.state().linked,true);
 await h.action('openFile',{id:'shared'});assert.equal(h.shown.at(-1).document.uri.scheme,'file');
});

test('multiple matching checkouts and same-named non-Git projects require explicit linking',async t=>{
 const multiple=await host(t,{identities:['github.com/team/app','github.com/team/app']});assert.equal(multiple.state().linked,false);
 multiple.pick(multiple.folders[1]);await multiple.action('linkRoom');assert.equal(multiple.state().repo.root,multiple.folders[1]);
 const local=await host(t,{identities:['local:app'],remote:'local:app'});assert.equal(local.state().linked,false);
 await local.action('linkRoom');assert.equal(local.state().linked,true);
});

test('a deleted saved checkout falls back rather than silently using another workspace folder',async t=>{
 const h=await host(t,{identities:['github.com/team/app','github.com/fork/app']});assert.equal(h.state().linked,true);
 await fs.rm(h.folders[0],{recursive:true,force:true});await h.action('refresh');assert.equal(h.state().linked,false);assert.equal(h.state().repo,undefined);
 await h.action('openFile',{id:'shared'});assert.equal(h.shown.at(-1).document.uri.scheme,'codejam-snapshot');
});

test('unsaved buffers are matched instead of stale on-disk code',async t=>{
 const h=await host(t),filename=path.join(h.folders[0],'src/utils.ts');
 h.documents.set(filename,h.makeDocument(h.vscode.Uri.file(filename),excerpt.replace('hello','unsaved')));
 await h.action('openFile',{id:'shared'});assert.equal(h.shown.at(-1).document.uri.scheme,'codejam-snapshot');
 h.documents.set(filename,h.makeDocument(h.vscode.Uri.file(filename),'// unsaved new line\n'+excerpt));
 await h.action('openFile',{id:'shared'});assert.equal(h.shown.at(-1).options.selection.start.line,1);
});

test('named references verify function context; sharing preserves the optional symbol name and relative path',async t=>{
 const h=await host(t);h.source.attachment.symbol='greet';
 h.symbols([{name:'otherFunction',kind:11,range:new Range(0,0,2,1),children:[]}]);
 await h.action('openFile',{id:'shared'});assert.equal(h.shown.at(-1).document.uri.scheme,'codejam-snapshot');
 h.symbols([{name:'greet',kind:11,range:new Range(0,0,2,1),children:[]}]);
 await h.action('openFile',{id:'shared'});assert.equal(h.shown.at(-1).document.uri.scheme,'file');
 const document=h.makeDocument(h.vscode.Uri.file(path.join(h.folders[0],'src/utils.ts')),excerpt);
 h.vscode.window.activeTextEditor={document,selection:Object.assign(new Range(0,0,2,1),{isEmpty:false})};
 await h.action('selection');const selected=h.posts.filter(p=>p.type==='selection').at(-1).attachment;
 assert.equal(selected.symbol,'greet');assert.equal(selected.path,'src/utils.ts');assert.equal(selected.code,excerpt);assert.equal(selected.repository,'github.com/team/app');
 assert.equal(JSON.stringify(selected).includes(h.folders[0]),false);
});

test('function selections that include their trailing newline still match the enclosing symbol',async t=>{
 const h=await host(t,{files:[excerpt+'\n']});h.source.attachment={...attachment,code:excerpt+'\n',symbol:'greet'};
 h.symbols([{name:'greet',kind:11,range:new Range(0,0,2,1),children:[]}]);
 await h.action('openFile',{id:'shared'});assert.equal(h.shown.at(-1).document.uri.scheme,'file');
 assert.equal(h.shown.at(-1).options.selection.end.line,3);assert.equal(h.shown.at(-1).options.selection.end.character,0);
});

test('symbol lookup failure or document edits during lookup cannot open a stale local range',async t=>{
 const h=await host(t);h.source.attachment={...attachment,code:'return "hello";',symbol:'greet'};
 await h.action('openFile',{id:'shared'});assert.equal(h.shown.at(-1).document.uri.scheme,'codejam-snapshot','partial named excerpts need function context when provider is unavailable');
 const filename=path.join(h.folders[0],'src/utils.ts'),document=h.makeDocument(h.vscode.Uri.file(filename),excerpt);h.documents.set(filename,document);
 const previous=h.vscode.commands.executeCommand;
 h.vscode.commands.executeCommand=async(command,...args)=>{if(command==='vscode.executeDocumentSymbolProvider'){document.version++;return [{name:'greet',kind:11,range:new Range(0,0,2,1),children:[]}];}return previous(command,...args);};
 await h.action('openFile',{id:'shared'});assert.equal(h.shown.at(-1).document.uri.scheme,'codejam-snapshot');
});

test('saved snapshots still open from pins when a message has fallen out of live history',async t=>{
 const h=await host(t);const state=h.state();
 state.rooms[0].messages=[];state.rooms[0].discussions=[];state.rooms[0].pins=[{id:'pin',source:h.source}];
 // Host snapshots share source room objects with this fixture, just like detail refreshes.
 await h.action('openSnapshot',{id:'shared'});assert.equal(h.shown.at(-1).document.getText(),excerpt);
});
