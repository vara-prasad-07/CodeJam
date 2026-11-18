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
