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

test('AI requires preview, keeps its draft private, and sends only after review',t=>{
 const h=setup(t),r={id:'r',name:'Room',members:[{id:'me',name:'Me'}],messages:[{id:'m',userId:'me',author:'Me',text:'Investigate the export',createdAt:new Date().toISOString()}]};
 h.emit({...h.state,active:'r',rooms:[r],aiConfigured:true});h.click('[data-action="openChat"]');h.click('[data-action="agent"]');
 assert.equal(h.q('[data-action="generateDraft"]').disabled,true);
 h.input('#ai-instruction','Explain the export');
 h.click('[data-action="previewContext"]');const preview=h.requests.at(-1);assert.equal(preview.type,'prepareContext');assert.equal(preview.includeDiff,false);
 h.emit({type:'contextPreview',operation:preview.operation,context:{messages:[{text:'Investigate the export'}]},contextId:'ctx'});h.ack(preview);
 h.click('[data-action="generateDraft"]');const generate=h.requests.at(-1);assert.equal(generate.contextId,'ctx');
 h.emit({type:'draft',operation:generate.operation,text:'Private draft for review',model:'test-model'});h.ack(generate);
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

test('general questions start without project context and preserve private review before sending',t=>{
 const h=setup(t);collaboration(h);h.input('#compose','@agent what is an LLM?');h.submit('#message-form');
 assert.equal(h.q('#ai-instruction').value,'what is an LLM?');
 for(const selector of ['#ai-code','#ai-messages','#ai-diff']){assert.equal(h.q(selector).checked,false);}
 assert.equal(h.q('#ai-code').disabled,true);
 h.click('[data-action="previewContext"]');const preview=h.requests.at(-1);
 assert.equal(preview.instruction,'what is an LLM?');assert.equal(preview.includeCode,false);assert.equal(preview.includeMessages,false);assert.equal(preview.includeDiff,false);
 assert.equal(h.q('#ai-instruction').disabled,true,'do not edit the question while preparing a snapshot');
 h.emit({type:'contextPreview',operation:preview.operation,context:{instruction:preview.instruction,messages:[],code:null,diff:'',repository:''},warnings:[],contextId:'question-only'});h.ack(preview);
 assert.match(h.q('#ai-context-preview').textContent,/QUESTION ONLY/);assert.match(h.q('#ai-context-preview').textContent,/No project code/);
 h.click('[data-action="generateDraft"]');const generate=h.requests.at(-1);
 h.emit({type:'draft',operation:generate.operation,text:'An LLM is a large language model.',model:'test-model'});h.ack(generate);
 assert.equal(h.requests.some(r=>r.type==='send'),false);
 h.input('#review-draft',' ');assert.equal(h.q('[data-action="sendReviewed"]').disabled,true);
 h.input('#review-draft','A reviewed explanation');assert.equal(h.q('[data-action="sendReviewed"]').disabled,false);
 h.click('[data-action="sendReviewed"]');assert.equal(h.requests.at(-1).text,'A reviewed explanation');assert.equal(h.requests.at(-1).reviewedDraft,true);
});

test('editing a question invalidates its preview and stale preview responses cannot re-enable generation',t=>{
 const h=setup(t);collaboration(h);h.click('[data-action="agent"]');
 assert.equal(h.q('[data-action="previewContext"]').disabled,true);
 h.input('#ai-instruction','First question');h.click('[data-action="previewContext"]');const preview=h.requests.at(-1);
 // Programmatic input also exercises a delayed response racing with a changed draft.
 h.input('#ai-instruction','Second question');
 h.emit({type:'contextPreview',operation:preview.operation,context:{instruction:'First question'},contextId:'stale'});h.ack(preview);
 assert.equal(h.q('[data-action="generateDraft"]').disabled,true);assert.doesNotMatch(h.q('#ai-context-preview').textContent,/First question/);
 h.click('[data-action="previewContext"]');const next=h.requests.at(-1);
 h.emit({type:'contextPreview',operation:next.operation,context:{instruction:'Second question',messages:[]},contextId:'fresh'});h.ack(next);
 assert.equal(h.q('[data-action="generateDraft"]').disabled,false);
 h.input('#ai-instruction','Third question');assert.equal(h.q('[data-action="generateDraft"]').disabled,true);
 assert.doesNotMatch(h.q('#ai-context-preview').textContent,/Preview ready/);
});

test('changing project-context choices clears consent for a previous snapshot',t=>{
 const h=setup(t);collaboration(h);h.click('[data-action="agent"]');h.input('#ai-instruction','Explain this');
 h.q('#ai-messages').checked=true;h.q('#ai-messages').dispatchEvent(new h.w.Event('change',{bubbles:true}));
 h.click('[data-action="previewContext"]');const preview=h.requests.at(-1);
 h.emit({type:'contextPreview',operation:preview.operation,context:{instruction:'Explain this',messages:[{text:'Original context'}]},contextId:'original'});h.ack(preview);
 h.q('#ai-messages').checked=false;h.q('#ai-messages').dispatchEvent(new h.w.Event('change',{bubbles:true}));
 assert.equal(h.q('[data-action="generateDraft"]').disabled,true);assert.doesNotMatch(h.q('#ai-context-preview').textContent,/Original context/);
 const before=h.requests.length;h.click('[data-action="generateDraft"]');assert.equal(h.requests.length,before);
});

test('an @agent prefix must be a full mention and empty questions stay blocked',t=>{
 const h=setup(t);collaboration(h);h.input('#compose','@agentic systems are useful');h.submit('#message-form');
 assert.equal(h.requests.at(-1).type,'send');h.ack(h.requests.at(-1));
 h.input('#compose','@agent');h.submit('#message-form');assert.equal(h.q('#ai-instruction').value,'');
 assert.equal(h.q('[data-action="previewContext"]').disabled,true);assert.equal(h.q('[data-action="generateDraft"]').disabled,true);
});

test('message-specific AI excludes unrelated composer attachments and keeps its source when changing context',t=>{
 const h=setup(t);collaboration(h);
 h.emit({type:'selection',attachment:{path:'private-draft.ts',line:1,code:'unrelated code'}});
 h.click('[data-action="messageMenu"]');h.click('.modal [data-action="agent"]');
 assert.equal(h.q('#ai-code').disabled,true);assert.equal(h.q('#ai-messages').checked,true);
 h.click('[data-action="previewContext"]');const preview=h.requests.at(-1);
 assert.equal(preview.sourceId,'root');assert.equal(preview.attachment,null);
 h.emit({type:'contextPreview',operation:preview.operation,context:{messages:[{text:'Review agent context'}]},contextId:'focused'});h.ack(preview);
 h.click('[data-action="generateDraft"]');const generation=h.requests.at(-1);
 h.emit({type:'draft',operation:generation.operation,text:'A focused answer',model:'test-model'});h.ack(generation);
 h.click('.modal [data-action="agent"]');h.click('[data-action="previewContext"]');
 assert.equal(h.requests.at(-1).sourceId,'root');assert.equal(h.requests.at(-1).attachment,null);
});

test('an AI response from a previous room cannot reopen its review in the new room',t=>{
 const h=setup(t);collaboration(h);h.click('[data-action="agent"]');h.input('#ai-instruction','Explain recursion');
 h.click('[data-action="previewContext"]');const preview=h.requests.at(-1);
 h.emit({type:'contextPreview',operation:preview.operation,context:{messages:[]},contextId:'old-room'});h.ack(preview);
 h.click('[data-action="generateDraft"]');const generation=h.requests.at(-1);
 h.emit({...h.state,active:'new-room',rooms:[{id:'new-room',name:'New room',members:[],messages:[]}]});
 h.emit({type:'draft',operation:generation.operation,text:'Old room private answer',model:'test-model'});h.ack(generation);
 assert.equal(h.q('.modal'),null);assert.doesNotMatch(h.q('#app').textContent,/Old room private answer/);
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
