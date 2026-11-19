const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {JSDOM}=require('jsdom');
const source=readFileSync(require('node:path').join(__dirname,'../media/app.js'),'utf8');
function setup(t,initial={}){
 const dom=new JSDOM('<!doctype html><div id="app"></div>',{url:'https://codejam.invalid',runScripts:'outside-only'});
 const w=dom.window,requests=[];let saved;
 w.acquireVsCodeApi=()=>({getState:()=>initial,setState:v=>saved=v,postMessage:v=>requests.push(v)});
 w.eval(source);t.after(()=>w.close());
 const emit=data=>w.dispatchEvent(new w.MessageEvent('message',{data}));
 const state={type:'state',rooms:[],repo:{name:'codejam',root:'C:/repo',detected:true,branch:'main',commit:'abc123',summary:'Initial base',author:'Vara',committedAt:'2026-11-18T09:00:00Z',stack:'TypeScript · Node.js',dirty:false},mode:'nexconn',connected:true,userId:'me',connection:'Saved locally'};
 emit(state);
 const q=s=>w.document.querySelector(s);
 const input=(s,value)=>{q(s).value=value;q(s).dispatchEvent(new w.Event('input',{bubbles:true}));};
 const click=s=>q(s).click();
 const submit=s=>q(s).dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 const ack=(request,ok=true)=>emit({type:'result',operation:request.operation,ok});
 return {w,q,input,click,submit,emit,state,requests,ack,saved:()=>saved};
}
test('Connect creates a room then opens functional chat; send acknowledgement clears draft',t=>{
 const h=setup(t);h.input('#room-name','My project');h.submit('#create-form');
 const request=h.requests.at(-1);assert.equal(request.type,'createRoom');assert.equal(request.name,'My project');
 const room={id:'room1',name:'My project',messages:[],members:[{id:'me',name:'Vara'}]};
 h.emit({...h.state,active:room.id,rooms:[room]});h.ack(request);
 assert.ok(h.q('[data-action="openChat"]'));h.click('[data-action="openChat"]');
 h.input('#compose','Hello team');h.submit('#message-form');
 const send=h.requests.at(-1);assert.equal(send.text,'Hello team');assert.equal(send.roomId,'room1');assert.ok(h.q('.send').disabled);
 room.messages.push({id:'m1',author:'Vara',userId:'me',text:send.text,createdAt:new Date().toISOString()});
 h.emit({...h.state,active:room.id,rooms:[room]});h.ack(send);
 assert.equal(h.q('#compose').value,'');assert.match(h.q('.messages').textContent,/Hello team/);
});
test('Failed messages retain draft, show error and retry with the same request ID',t=>{
 const h=setup(t);h.emit({...h.state,active:'r',rooms:[{id:'r',name:'Room',messages:[],members:[]}]});h.click('[data-action="openChat"]');
 h.input('#compose','Keep my draft');h.submit('#message-form');const first=h.requests.at(-1);
 h.emit({type:'notice',text:'Server offline'});h.ack(first,false);
 assert.equal(h.q('#compose').value,'Keep my draft');assert.equal(h.q('.toast').textContent,'Server offline');
 h.submit('#message-form');assert.equal(h.requests.at(-1).operation,first.operation);
});
test('Polling preserves focused draft and escapes remote messages; invite join is wired',t=>{
 const h=setup(t);const room={id:'r',name:'Room',members:[],messages:[]};
 h.emit({...h.state,active:'r',rooms:[room]});h.click('[data-action="openChat"]');
 h.input('#compose','WIP');h.q('#compose').focus();h.q('#compose').setSelectionRange(1,2);
 room.messages.push({id:'m',author:'<img src=x>',text:'<script>alert(1)</script>',userId:'other',createdAt:new Date().toISOString()});
 h.emit({...h.state,active:'r',rooms:[room]});assert.equal(h.q('#compose').value,'WIP');assert.equal(h.w.document.activeElement.id,'compose');assert.equal(h.q('#compose').selectionStart,1);assert.equal(h.q('.messages script'),null);assert.equal(h.q('.messages img'),null);
 h.click('[data-tab="connect"]');h.emit({...h.state,active:'r',rooms:[room],mode:'nexconn',connected:true,connection:'Connected to Nexconn'});h.click('[data-connect="join"]');h.input('#invite','cdj-code');h.submit('#join-form');assert.equal(h.requests.at(-1).type,'joinRoom');assert.equal(h.requests.at(-1).invite,'cdj-code');
});

test('AI requires preview, keeps its draft private, and sends only after review',t=>{
 const h=setup(t),r={id:'r',name:'Room',members:[{id:'me',name:'Me'}],messages:[{id:'m',userId:'me',author:'Me',text:'Investigate the export',createdAt:new Date().toISOString()}]};
 h.emit({...h.state,active:'r',rooms:[r],aiConfigured:true});h.click('[data-action="openChat"]');h.click('[data-action="agent"]');
 assert.equal(h.q('[data-action="generateDraft"]').disabled,true);
 h.click('[data-action="previewContext"]');const preview=h.requests.at(-1);assert.equal(preview.type,'prepareContext');assert.equal(preview.includeDiff,false);
 h.emit({type:'contextPreview',context:{messages:[{text:'Investigate the export'}]},contextId:'ctx'});h.ack(preview);
 h.click('[data-action="generateDraft"]');const generate=h.requests.at(-1);assert.equal(generate.contextId,'ctx');
 h.emit({type:'draft',text:'Private draft for review',model:'test-model'});h.ack(generate);
 assert.equal(h.requests.filter(x=>x.type==='send').length,0);
 h.input('#review-draft','Edited and reviewed draft');h.click('[data-action="sendReviewed"]');assert.equal(h.requests.at(-1).text,'Edited and reviewed draft');assert.equal(h.requests.at(-1).reviewedDraft,true);
});

test('Firebase password remains transient across refresh and is never persisted in webview state',t=>{
 const h=setup(t);h.emit({...h.state,authenticated:false});h.input('#auth-email','person@example.com');h.input('#auth-password','transient-password');
 h.emit({...h.state,authenticated:false,connection:'Please sign in'});assert.equal(h.q('#auth-password').value,'transient-password');
 assert.equal(JSON.stringify(h.saved()).includes('transient-password'),false);
 h.submit('#auth-form');assert.equal(h.requests.at(-1).type,'signIn');assert.equal(h.requests.at(-1).password,'transient-password');
});

function collaboration(h){
 const source={id:'root',userId:'other',author:'Teammate',text:'Review agent context',createdAt:'2026-11-19T12:00:00Z'};
 const room={id:'r',name:'Build room',members:[{id:'me',name:'Me'},{id:'other',name:'Teammate'}],messages:[source],discussions:[{id:'open',title:'Review context',status:'open',source,createdAt:source.createdAt},{id:'done',title:'Finished discussion',status:'resolved',source:{...source,id:'other-root'},createdAt:source.createdAt}],pins:[]};
 h.emit({...h.state,active:room.id,rooms:[room]});
 return room;
}

test('Discussions have a stable destination, status filters, and independent drafts',t=>{
 const h=setup(t);collaboration(h);
 assert.ok(h.q('nav [data-tab="chat"][aria-current="page"]'));
 assert.equal(h.q('.discussion-tray'),null);
 h.input('#compose','Room draft');
 h.click('[data-tab="discussions"]');
 assert.equal(h.w.document.querySelectorAll('.discussion-item').length,1);
 h.click('[data-filter="resolved"]');assert.match(h.q('.discussion-item').textContent,/Finished discussion/);
 h.click('[data-filter="all"]');assert.equal(h.w.document.querySelectorAll('.discussion-item').length,2);
 h.click('[data-action="openThread"][data-id="open"]');
 assert.equal(h.q('#compose').value,'');assert.ok(h.q('nav [data-tab="discussions"][aria-current="page"]'));
 h.input('#compose','Thread draft');
 h.click('[data-action="backDiscussions"]');h.click('[data-tab="chat"]');
 assert.equal(h.q('#compose').value,'Room draft');
 h.click('[data-tab="discussions"]');h.click('[data-action="openThread"][data-id="open"]');
 assert.equal(h.q('#compose').value,'Thread draft');
 h.submit('#message-form');assert.equal(h.requests.at(-1).discussionId,'open');
});

test('Message actions retain their source, close after reply, and preserve focus on Escape',t=>{
 const h=setup(t);collaboration(h);
 const more=h.q('[data-action="messageMenu"]');more.focus();more.click();
 assert.match(h.q('.message-preview').textContent,/Review agent context/);
 h.q('[data-action="close"]').dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
 assert.equal(h.q('.modal'),null);assert.equal(h.w.document.activeElement.dataset.action,'messageMenu');
 h.click('[data-action="messageMenu"]');h.click('.modal [data-action="reply"]');
 assert.equal(h.q('.modal'),null);assert.match(h.q('.attachment').textContent,/Replying to Teammate/);
 h.input('#compose','A focused reply');h.submit('#message-form');assert.equal(h.requests.at(-1).replyTo,'root');
});

test('Room picker exposes the active room and supports Escape and outside dismissal',t=>{
 const h=setup(t);collaboration(h);
 h.click('[data-action="rooms"]');
 assert.equal(h.q('[data-action="rooms"]').getAttribute('aria-expanded'),'true');
 assert.equal(h.q('.room-option[aria-current="true"]').dataset.id,'r');
 h.q('.room-option').dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
 assert.equal(h.q('.room-menu'),null);assert.equal(h.w.document.activeElement.dataset.action,'rooms');
 h.click('[data-action="rooms"]');h.q('#compose').click();
 assert.equal(h.q('.room-menu'),null);assert.equal(h.q('[data-action="rooms"]').getAttribute('aria-expanded'),'false');
});

test('Message overflow keeps discussion, decisions, and AI actions reachable',t=>{
 const h=setup(t);collaboration(h);
 h.click('[data-action="messageMenu"]');h.click('.modal [data-action="pin"]');
 assert.equal(h.q('#pin-text').value,'Review agent context');
 h.input('#pin-title','Keep AI drafts private');h.click('[data-action="savePin"]');
 const pin=h.requests.at(-1);assert.equal(pin.type,'pin');assert.equal(pin.id,'root');h.ack(pin);
 h.click('[data-action="messageMenu"]');h.click('.modal [data-action="discuss"]');
 assert.ok(h.q('.thread-heading'));
 h.click('[data-tab="chat"]');h.click('[data-action="messageMenu"]');h.click('.modal [data-action="agent"]');
 h.click('[data-action="previewContext"]');assert.equal(h.requests.at(-1).sourceId,'root');
});

test('paused metadata updates explain the state without blocking live chat or losing the draft',t=>{
 const h=setup(t),room=collaboration(h);h.input('#compose','Keep working');
 h.emit({...h.state,rooms:[room],active:room.id,connected:true,updatesPaused:true});
 assert.match(h.q('.sync-banner').textContent,/Chat is still connected/);
 assert.equal(h.q('#compose').value,'Keep working');assert.equal(h.q('#compose').disabled,false);
 h.emit({...h.state,rooms:[room],active:room.id,connected:true,updatesPaused:false});assert.equal(h.q('.sync-banner'),null);
});
