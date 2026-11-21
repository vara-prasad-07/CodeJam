const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {JSDOM}=require('jsdom');
const source=readFileSync(require('node:path').join(__dirname,'../media/app.js'),'utf8');
function setup(t,initial={}){
 const dom=new JSDOM('<!doctype html><div id="app"></div>',{url:'https://codejam.invalid',runScripts:'outside-only'});
 const w=dom.window,requests=[];let saved;
 w.URL.createObjectURL=()=> 'blob:https://codejam.invalid/voice-preview';w.URL.revokeObjectURL=()=>{};
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

function openContext(h){if(!h.q('#agent-context-popover')){h.click('[data-action="agentContext"]');}}
function checked(h,key){openContext(h);return h.q('#ai-'+key).checked;}
function grant(h,key,value=true){openContext(h);const el=h.q('#ai-'+key);el.checked=value;el.dispatchEvent(new h.w.Event('change',{bubbles:true}));}
function answer(h,request,extra={}){h.emit({type:'agentResponse',operation:request.operation,roomId:request.roomId,status:'answer',text:'A private answer',answerId:request.operation,model:'test-model',shared:false,...extra});}

test('email and Google authentication have no language selector or language override',t=>{
 const h=setup(t);h.emit({...h.state,authenticated:false});assert.equal(h.q('#auth-language'),null);h.click('[data-auth="signup"]');
 assert.equal(h.q('#auth-language'),null);
 h.input('#auth-password','example-password');h.submit('#auth-form');assert.equal(h.requests.at(-1).language,undefined);h.ack(h.requests.at(-1),false);
 h.click('[data-action="googleSignIn"]');assert.equal(h.requests.at(-1).language,undefined);
});

test('Translate offers three languages, preselects the account preference and renders only a private result',t=>{
 const h=setup(t),r=collaboration(h);h.emit({...h.state,active:r.id,rooms:[r],user:{language:'hi'}});
 h.click('[data-action="messageMenu"]');h.click('[data-action="translateMenu"]');
 assert.equal(h.q('#translation-language').value,'hi');assert.equal(h.w.document.querySelectorAll('#translation-language option').length,3);
 h.q('#translation-language').value='te';h.q('#translation-language').dispatchEvent(new h.w.Event('change',{bubbles:true}));h.click('[data-action="translateMessage"]');
 const request=h.requests.at(-1);assert.equal(request.type,'translateMessage');assert.equal(request.roomId,r.id);assert.equal(request.id,'root');assert.equal(request.language,'te');
 h.emit({type:'translation',operation:request.operation,roomId:r.id,id:'root',language:'te',text:'నమస్కారం <img src=x>'});h.ack(request);
 assert.match(h.q('.message-translation').textContent,/Only you/);assert.equal(h.q('.message-translation img'),null);assert.match(h.q('.message').textContent,/Review agent context/);
 assert.equal(r.messages[0].text,'Review agent context');assert.equal(JSON.stringify(h.saved()).includes('నమస్కారం'),false);assert.equal(h.requests.some(r=>r.type==='send'),false);
 h.click('[data-action="hideTranslation"]');assert.equal(h.q('.message-translation'),null);
 h.emit({...h.state,active:r.id,rooms:[r],user:{language:'te'}});h.click('[data-action="messageMenu"]');h.click('[data-action="translateMenu"]');assert.equal(h.q('#translation-language').value,'te');
});

test('failed translations remain retryable and late results from another room are ignored',t=>{
 const h=setup(t),r=collaboration(h);h.click('[data-action="messageMenu"]');h.click('[data-action="translateMenu"]');h.click('[data-action="translateMessage"]');
 const request=h.requests.at(-1);h.emit({type:'notice',text:'Translation unavailable'});h.ack(request,false);assert.match(h.q('.translation-error').textContent,/unavailable/);
 h.emit({...h.state,active:'other',rooms:[{...r,id:'other'}]});h.emit({type:'translation',operation:request.operation,roomId:r.id,id:'root',language:'en',text:'Private old translation'});
 assert.equal(h.q('.message-translation'),null);
});

test('account language can be changed without translating or sending a message',t=>{
 const h=setup(t);collaboration(h);h.click('[data-action="account"]');h.q('#account-language').value='hi';h.q('#account-language').dispatchEvent(new h.w.Event('change',{bubbles:true}));h.click('[data-action="setLanguage"]');
 assert.equal(h.requests.at(-1).type,'setLanguage');assert.equal(h.requests.at(-1).language,'hi');assert.equal(h.requests.some(r=>r.type==='translateMessage'||r.type==='send'),false);
});

test('context icon opens three independently selectable options and preserves draft and keyboard focus',t=>{
 const h=setup(t);collaboration(h);h.input('#compose','Keep this draft');
 assert.equal(h.q('#agent-context-popover'),null);assert.equal(h.q('#ai-code'),null);
 openContext(h);assert.equal(h.q('[data-action="agentContext"]').getAttribute('aria-expanded'),'true');
 assert.equal(h.w.document.querySelectorAll('#agent-context-popover input[type="checkbox"]').length,3);
 grant(h,'code');grant(h,'messages');assert.equal(checked(h,'code'),true);assert.equal(checked(h,'messages'),true);assert.equal(checked(h,'diff'),false);
 assert.equal(h.w.document.activeElement.id,'ai-code');
 h.q('#ai-messages').focus();h.q('#ai-messages').dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
 assert.equal(h.q('#agent-context-popover'),null);assert.equal(h.w.document.activeElement.dataset.action,'agentContext');
 assert.equal(h.q('#compose').value,'Keep this draft');assert.match(h.q('[data-action="agentContext"]').getAttribute('aria-label'),/2 enabled/);
 openContext(h);assert.equal(checked(h,'code'),true);h.q('#compose').focus();assert.equal(h.q('#agent-context-popover'),null);
 openContext(h);h.q('#compose').click();assert.equal(h.q('#agent-context-popover'),null);
 openContext(h);h.click('[data-action="closeAgentContext"]');assert.equal(h.q('#agent-context-popover'),null);
});

test('@agent + Enter submits directly with default-deny permissions and no preview or public message',t=>{
 const h=setup(t);collaboration(h);h.input('#compose','@agent What is a vision model?');
 h.q('#compose').dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
 const request=h.requests.at(-1);assert.equal(request.type,'askAgent');assert.equal(request.instruction,'What is a vision model?');
 assert.equal(request.permissions.code,false);assert.equal(request.permissions.messages,false);assert.equal(request.permissions.diff,false);
 assert.equal(h.q('.modal'),null);assert.equal(h.q('#compose').disabled,false);assert.match(h.q('.agent-panel').textContent,/thinking/);
 answer(h,request);assert.equal(h.q('#compose').value,'');assert.match(h.q('.agent-panel').textContent,/only you/);assert.ok(h.q('[data-action="shareAgent"]'));
 assert.equal(h.requests.some(r=>r.type==='send'||r.type==='prepareContext'||r.type==='generateDraft'),false);
 h.click('[data-action="shareAgent"]');const share=h.requests.at(-1);assert.equal(share.type,'shareAgent');assert.equal(share.answerId,request.operation);h.ack(share);
 assert.match(h.q('.agent-panel').textContent,/shared/);
});

test('permission errors remain private, retain the question and retry with the updated checkboxes',t=>{
 const h=setup(t);collaboration(h);grant(h,'code');h.input('#compose','@agent Explain this code based on our team discussion');h.submit('#message-form');const request=h.requests.at(-1);
 answer(h,request,{status:'needs_context',text:'Please enable Recent messages',missingSources:['messages']});
 assert.equal(h.q('#compose').value,'@agent Explain this code based on our team discussion');assert.match(h.q('.agent-panel').textContent,/enable Recent messages/);assert.equal(h.q('[data-action="shareAgent"]'),null);
 grant(h,'messages');h.click('[data-action="retryAgent"]');const retry=h.requests.at(-1);
 assert.equal(retry.type,'askAgent');assert.equal(retry.permissions.code,true);assert.equal(retry.permissions.messages,true);assert.notEqual(retry.operation,request.operation);
 assert.equal(h.requests.some(r=>r.type==='send'),false);
});

test('context grants survive rerenders but are scoped to account, room and checkout',t=>{
 const h=setup(t),r=collaboration(h);grant(h,'messages');h.emit({...h.state,active:r.id,rooms:[r],connection:'Updated'});assert.equal(checked(h,'messages'),true);
 assert.ok(h.saved().aiGrants);
 h.emit({...h.state,active:'other',rooms:[{...r,id:'other'}]});assert.equal(checked(h,'messages'),false);
 h.emit({...h.state,active:r.id,rooms:[r]});assert.equal(checked(h,'messages'),true);
 h.emit({...h.state,userId:'different-account',active:r.id,rooms:[r]});assert.equal(checked(h,'messages'),false);
 h.emit({...h.state,repo:{...h.state.repo,root:'C:/another'},active:r.id,rooms:[r]});assert.equal(checked(h,'messages'),false);
});

test('revoking permissions cancels pending generation and ignores its late response',t=>{
 const h=setup(t);collaboration(h);grant(h,'code');h.input('#compose','@agent Explain this code');h.submit('#message-form');const request=h.requests.at(-1);
 grant(h,'code',false);assert.equal(h.requests.at(-1).type,'cancelAgent');answer(h,request,{text:'Late code answer'});
 assert.equal(h.q('.agent-panel'),null);assert.equal(h.q('#compose').value,'@agent Explain this code');
});

test('room, account, checkout and discussion changes discard late private answers',t=>{
 const h=setup(t),r=collaboration(h);h.input('#compose','@agent Explain recursion');h.submit('#message-form');const request=h.requests.at(-1);
 h.emit({...h.state,active:'other',rooms:[{...r,id:'other'}]});answer(h,request,{text:'Old private answer'});
 assert.equal(h.q('.agent-panel'),null);assert.doesNotMatch(h.q('#app').textContent,/Old private answer/);
});

test('duplicate Enter is ignored while thinking and normal chat can still send',t=>{
 const h=setup(t);collaboration(h);h.input('#compose','@agent Explain recursion');h.submit('#message-form');const request=h.requests.at(-1);h.submit('#message-form');
 assert.equal(h.requests.filter(r=>r.type==='askAgent').length,1);
 h.input('#compose','A normal team message');h.submit('#message-form');const send=h.requests.at(-1);assert.equal(send.type,'send');h.ack(send);
 h.input('#compose','New draft while waiting');answer(h,request);assert.equal(h.q('#compose').value,'New draft while waiting');
});

test('message-specific Agent requests preserve their source without enabling permissions or sending unrelated attachments',t=>{
 const h=setup(t);collaboration(h);h.emit({type:'selection',attachment:{path:'unrelated.ts',code:'private code',line:1}});
 h.click('[data-action="messageMenu"]');h.click('.modal [data-action="agent"]');
 assert.equal(h.q('.modal'),null);assert.equal(checked(h,'messages'),false);grant(h,'messages');h.submit('#message-form');
 const request=h.requests.at(-1);assert.equal(request.sourceId,'root');assert.equal(request.attachment,null);assert.equal(request.permissions.messages,true);
});

test('bare mentions, oversized questions and @agentic have distinct behavior',t=>{
 const h=setup(t);collaboration(h);h.input('#compose','@agentic systems');h.submit('#message-form');assert.equal(h.requests.at(-1).type,'send');h.ack(h.requests.at(-1));
 const before=h.requests.length;h.input('#compose','@agent');h.submit('#message-form');assert.equal(h.requests.length,before);assert.match(h.q('.agent-panel').textContent,/Enter a question/);
 h.input('#compose','@agent '+ 'x'.repeat(2001));h.submit('#message-form');assert.equal(h.requests.length,before);assert.match(h.q('.agent-panel').textContent,/2,000/);
});

test('private answer markup is escaped, is not persisted and retry does not erase a different draft',t=>{
 const h=setup(t);collaboration(h);h.input('#compose','@agent First question');h.submit('#message-form');const request=h.requests.at(-1);
 answer(h,request,{status:'error',text:'Temporary failure'});h.input('#compose','An unrelated draft');h.click('[data-action="retryAgent"]');
 const retry=h.requests.at(-1);answer(h,retry,{text:'<img src=x onerror=alert(1)> private answer'});
 assert.equal(h.q('#compose').value,'An unrelated draft');assert.equal(h.q('.agent-panel img'),null);assert.equal(JSON.stringify(h.saved()).includes('private answer'),false);
});

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
 h.submit('#message-form');assert.equal(h.requests.at(-1).sourceId,'root');
});

test('paused metadata updates explain the state without blocking live chat or losing the draft',t=>{
 const h=setup(t),room=collaboration(h);h.input('#compose','Keep working');
 h.emit({...h.state,rooms:[room],active:room.id,connected:true,updatesPaused:true});
 assert.match(h.q('.sync-banner').textContent,/Chat is still connected/);
 assert.equal(h.q('#compose').value,'Keep working');assert.equal(h.q('#compose').disabled,false);
 h.emit({...h.state,rooms:[room],active:room.id,connected:true,updatesPaused:false});assert.equal(h.q('.sync-banner'),null);
});

test('native voice UI preserves text drafts, locks destination and sends only after preview',t=>{
 const h=setup(t);const r=collaboration(h);h.emit({...h.state,voiceSupported:true,active:r.id,rooms:[r]});h.click('[data-action="openChat"]');
 h.input('#compose','Keep this text draft');h.click('[data-action="voiceStart"]');const start=h.requests.at(-1);assert.equal(start.type,'voiceStart');
 const voice={id:'voice',clientId:'voice-send',roomId:r.id,phase:'recording',duration:2,level:.5};
 h.emit({type:'voiceState',state:voice});h.ack(start);assert.ok(h.q('[data-action="voiceStop"]'));assert.equal(h.q('#compose'),null);
 h.click('[data-tab="team"]');assert.ok(h.q('[data-action="voiceStop"]'));assert.match(h.q('.toast').textContent,/Send or discard/);
 h.click('[data-action="voiceStop"]');const stop=h.requests.at(-1);assert.equal(stop.voiceId,'voice');
 h.emit({type:'voiceState',state:{...voice,phase:'preview'},audioBase64:'UklGRg=='});h.ack(stop);
 assert.ok(h.q('.voice-preview'));assert.equal(h.requests.filter(r=>r.type==='sendVoice').length,0);
 h.click('[data-action="sendVoice"]');const send=h.requests.at(-1);assert.equal(send.voiceId,'voice');assert.equal(send.text,undefined);
 h.emit({type:'voiceState',state:null});h.ack(send);assert.equal(h.q('#compose').value,'Keep this text draft');
});

test('voice discard restores the draft and upload errors retain local preview for retry',t=>{
 const h=setup(t);const r=collaboration(h);h.emit({...h.state,voiceSupported:true,active:r.id,rooms:[r]});h.click('[data-action="openChat"]');h.input('#compose','Existing draft');
 const voice={id:'voice',clientId:'stable',roomId:r.id,phase:'preview',duration:3,level:0};
 h.emit({type:'voiceState',state:voice,audioBase64:'UklGRg=='});
 h.click('[data-action="sendVoice"]');const failed=h.requests.at(-1);h.emit({type:'voiceState',state:{...voice,phase:'uploading',progress:50}});assert.ok(h.q('[data-action="voiceDiscard"]').disabled);
 h.emit({type:'voiceState',state:{...voice,error:'Upload failed'}});h.ack(failed,false);assert.ok(h.q('.voice-preview'));assert.match(h.q('.voice-error').textContent,/Upload failed/);
 h.click('[data-action="voiceDiscard"]');const discard=h.requests.at(-1);h.emit({type:'voiceState',state:null});h.ack(discard);assert.equal(h.q('#compose').value,'Existing draft');
});

test('received voice-only messages render a player and unavailable recorders stay disabled',t=>{
 const h=setup(t);const r=collaboration(h);r.messages.push({id:'clip',author:'Teammate',userId:'other',text:'',createdAt:new Date().toISOString(),voice:{url:'https://media.example/clip.wav',duration:3,mimeType:'audio/wav'}});
 h.emit({...h.state,voiceSupported:false,voiceUnavailable:'Remote recording unavailable',active:r.id,rooms:[r]});h.click('[data-action="openChat"]');
 assert.equal(h.q('audio[data-audio-key="clip"]').getAttribute('preload'),'none');assert.ok(h.q('[data-action="voiceStart"]').disabled);
 const before=h.requests.length;h.emit({type:'voiceState',state:{id:'stale',roomId:'other-room',phase:'recording'}});assert.equal(h.q('.voice-composer'),null);assert.equal(h.requests.length,before);
});


test('Enter sends chat and discussion replies while Shift+Enter and IME preserve drafts',t=>{
 const h=setup(t);collaboration(h);
 const key=options=>h.q('#compose').dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true,...options}));
 h.input('#compose','Hello with Enter');const before=h.requests.length;
 for(const options of [{shiftKey:true},{isComposing:true},{keyCode:229}]){assert.equal(key(options),true);assert.equal(h.requests.length,before);}
 assert.equal(key({}),false);const sent=h.requests.at(-1);assert.equal(sent.type,'send');assert.equal(sent.text,'Hello with Enter');h.ack(sent);
 h.click('[data-tab="discussions"]');h.click('[data-action="openThread"][data-id="open"]');h.input('#compose','Discussion reply');key({});
 const reply=h.requests.at(-1);assert.equal(reply.type,'send');assert.equal(reply.discussionId,'open');h.ack(reply);
 h.input('#compose','Keyboard shortcut');key({ctrlKey:true});assert.equal(h.requests.at(-1).text,'Keyboard shortcut');
});

test('owners can confirm removal and deletion for the selected room, and failures remain retryable',t=>{
 const h=setup(t),r=collaboration(h);h.click('[data-tab="team"]');
 assert.ok(h.q('[data-action="deleteRoomConfirm"]'));assert.ok(h.q('[data-action="leaveRoomConfirm"]'));
 h.click('[data-action="removeMemberConfirm"]');assert.match(h.q('.modal').textContent,/Teammate/);
 h.click('[data-action="removeMember"]');const remove=h.requests.at(-1);
 assert.equal(remove.type,'removeMember');assert.equal(remove.userId,'other');assert.equal(remove.roomId,r.id);
 h.ack(remove,false);assert.ok(h.q('.modal'));
 h.click('[data-action="close"]');h.click('[data-action="deleteRoomConfirm"]');
 const before=h.requests.length;h.click('[data-action="close"]');assert.equal(h.requests.length,before);
 h.click('[data-action="deleteRoomConfirm"]');h.click('[data-action="deleteRoom"]');
 const deletion=h.requests.at(-1);assert.equal(deletion.type,'deleteRoom');assert.equal(deletion.roomId,r.id);
 h.emit({...h.state,rooms:[],active:undefined});h.ack(deletion);
 assert.ok(h.q('#create-form'));assert.equal(h.q('.modal'),null);
});

test('members can exit but cannot see owner controls',t=>{
 const h=setup(t),r=collaboration(h);r.ownerId='other';h.emit({...h.state,active:r.id,rooms:[r]});h.click('[data-tab="team"]');
 assert.equal(h.q('[data-action="deleteRoomConfirm"]'),null);assert.equal(h.q('[data-action="removeMemberConfirm"]'),null);
 h.click('[data-action="leaveRoomConfirm"]');h.click('[data-action="leaveRoom"]');
 assert.equal(h.requests.at(-1).type,'leaveRoom');assert.equal(h.requests.at(-1).roomId,r.id);h.ack(h.requests.at(-1));
});

test('room-menu exit explains owner succession and last-member deletion',t=>{
 const h=setup(t),r=collaboration(h);h.click('[data-action="rooms"]');
 assert.ok(h.q('#room-menu [data-action="deleteRoomConfirm"]'));
 h.click('#room-menu [data-action="leaveRoomConfirm"]');assert.match(h.q('.modal').textContent,/Teammate will become the room owner/);
 h.click('[data-action="close"]');r.members=r.members.slice(0,1);h.emit({...h.state,active:r.id,rooms:[r]});
 h.click('[data-action="rooms"]');h.click('#room-menu [data-action="leaveRoomConfirm"]');
 assert.match(h.q('.modal').textContent,/last member.*room will be deleted/);
});
