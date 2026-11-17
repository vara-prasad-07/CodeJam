/* Local interface preview. Network services are deliberately not connected yet. */
(() => {
 const vscode = acquireVsCodeApi();
 const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 const shapes = {
  code:'<path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-14-2 18"/>',
  down:'<path d="m7 10 5 5 5-5"/>', hash:'<path d="M5 9h14M4 15h14M11 3 7 21M17 3l-4 18"/>',
  phone:'<path d="M8 3H4a1 1 0 0 0-1 1 17 17 0 0 0 17 17 1 1 0 0 0 1-1v-4l-5-2-2 2a13 13 0 0 1-6-6l2-2Z"/>',
  users:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m2-16a3 3 0 0 1 0 6m2 10v-3a6 6 0 0 0-2-4"/>',
  spark:'<path d="m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4ZM20 2v4m-2-2h4"/>',
  send:'<path d="m4 12 16-8-6 16-3-7-7-1Zm7 1 9-9"/>',
  pin:'<path d="m15 3 6 6-4 1-4 5-1 4-7-7 4-1 5-4 1-4Zm-7 13-5 5"/>',
  reply:'<path d="m9 5-6 6 6 6m-6-6h11a7 7 0 0 1 7 7v2"/>',
  plus:'<path d="M12 5v14M5 12h14"/>', check:'<path d="m5 12 4 4L19 6"/>',
  close:'<path d="m6 6 12 12M6 18 18 6"/>', branch:'<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M6 7v10m12-10a10 10 0 0 1-10 8H6"/>',
  arrow:'<path d="M7 17 17 7M7 7h10v10"/>', lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>'
 };
 const icon = name => `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${shapes[name] || shapes.code}</svg>`;
 const initial = {
  tab:'chat', active:'codejam', projects:[{id:'codejam',name:'CodeJam',repo:'codejam / main'}],
  rooms:{codejam:{resolved:false,messages:[
   {id:'sample-1',author:'Alex',initials:'AL',time:'10:42',text:'The session expires right after refresh. Could you take a look?',attachment:{path:'src/auth/session.ts',line:24,endLine:27,code:'export function refreshSession() {\n  const expiresAt = Date.now();\n  return { ...session, expiresAt };\n}',sample:true}},
   {id:'sample-2',author:'You',initials:'YO',time:'10:44',text:'Looking into it. Let’s keep the debugging context here.'}
  ],pins:[{id:'decision-1',title:'Keep session expiry in milliseconds',text:'Use one time unit throughout the session flow. Add a regression check for refresh.',path:'src/auth/session.ts',line:24,sample:true}]}}
 };
 let state = vscode.getState() || initial;
 if (!state.rooms || !state.projects) { state = initial; }
 let attachment = null, replyTo = null, modal = null, composerText = '', toastTimer;
 const app = document.getElementById('app');
 const room = () => state.rooms[state.active];
 const project = () => state.projects.find(p => p.id === state.active);
 const persist = () => vscode.setState(state);
 const button = (action,label,name,classes='icon-button',extra='') => `<button class="${classes}" data-action="${action}" aria-label="${esc(label)}" title="${esc(label)}" ${extra}>${name ? icon(name) : ''}${classes.includes('icon-button') || classes === 'send' ? '' : esc(label)}</button>`;
 function codeCard(a,id){return `<div class="code-card"><div class="code-top">${icon('code')}<span>${esc(a.path)}</span>${button('open','Open file','arrow','icon-button',`data-id="${esc(id)}"`)}</div><pre><code>${esc(a.code)}</code></pre><div class="code-meta">${a.sample ? 'sample · ' : 'local selection · '}L${esc(a.line)}–${esc(a.endLine)}</div></div>`;}
 function message(m){return `<article class="message"><div class="avatar ${m.author === 'You' ? 'me' : ''}">${esc(m.initials)}</div><div class="message-body"><div class="message-head"><strong>${esc(m.author)}</strong><span class="time">${esc(m.time)}</span>${m.ai ? '<span class="pill">Reviewed draft</span>' : ''}</div>${m.reply ? `<div class="sub">Reply to ${esc(m.reply)}</div>` : ''}<p>${esc(m.text)}</p>${m.attachment ? codeCard(m.attachment,m.id) : ''}<div class="actions">${button('reply','Reply','reply','text-button',`data-id="${esc(m.id)}"`)}${button('pin',room().pins.some(p=>p.messageId===m.id)?'Pinned':'Pin decision','pin','text-button',`data-id="${esc(m.id)}"`)}</div></div></article>`;}
 function render(){
  persist();
  app.innerHTML = `<header><div class="brand"><span class="brand-mark">${icon('code')}</span>codejam<span class="badge">UI preview</span></div><button class="project-switch" data-action="projects" aria-label="Switch project"><span class="project-icon">${icon('code')}</span><div class="grow"><strong>${esc(project().name)}</strong><div class="sub">${esc(project().repo)}</div></div><span class="chevron">${icon('down')}</span></button><nav class="tabs" aria-label="Workspace navigation">${['chat','decisions','projects'].map(tab=>`<button class="tab ${state.tab===tab?'active':''}" data-tab="${tab}" aria-current="${state.tab===tab?'page':'false'}">${tab[0].toUpperCase()+tab.slice(1)}${tab==='decisions'?`<span class="count">${room().pins.length}</span>`:''}</button>`).join('')}</nav></header><main class="view" id="content">${state.tab==='chat'?chat():state.tab==='decisions'?decisions():projects()}</main>${state.tab==='chat'?composer():''}`;
  if (modal) { renderModal(); }
 }
 function chat(){return `<div class="room-bar">${icon('hash')}<div class="grow"><strong>project-room</strong><div><small>${room().resolved ? '<span class="resolved">✓ Discussion resolved</span>' : '<span class="dot"></span>Local workspace'}</small></div></div>${button('resolve',room().resolved?'Reopen discussion':'Resolve discussion','check')}${button('members','Team members','users')}${button('call','Start a call','phone')}</div><div class="intro"><span class="eyebrow">A little less switching.</span><h1>Same code.<br>Shared context.</h1><p>Your team’s thinking, right beside the code.</p></div><div class="day">${state.active==='codejam'?'Sample conversation':'Your conversation'}</div>${room().messages.map(message).join('')}${!room().messages.length?'<div class="empty">Start with a question or a few lines of code.</div>':''}<div class="hint-card">${icon('spark')}<div><strong>Leave a better handoff.</strong><p>Turn the discussion into a clear next step.</p>${button('agent','Draft with @agent',null,'text-button accent-text')}</div></div>`;}
 function composer(){return `<div class="composer-wrap">${replyTo?`<div class="reply-note">Replying to ${esc(replyTo.author)} ${button('cancelReply','Cancel reply','close')}</div>`:''}<div class="composer">${attachment?`<div class="attachment">${icon('code')}<span>${esc(attachment.path)} · L${attachment.line}–${attachment.endLine}</span>${button('detach','Remove attachment','close')}</div>`:''}<textarea id="compose" aria-label="Message project room" placeholder="Message your team, or ask @agent…" maxlength="12000">${esc(composerText)}</textarea><div class="composer-tools">${button('attach','Attach selected code','code')}${button('agent','@agent','spark','agent-button')}${button('send','Send message','send','send')}</div></div><div class="footer"><span>${icon('lock')} Local preview · saved in this view</span><span>Enter to send</span></div></div>`;}
 function decisions(){return `<section class="section"><span class="eyebrow">The things we agreed on</span><h2>Decisions, kept.</h2><p>A small source of truth for your project.</p>${room().pins.length?room().pins.map(p=>`<article class="decision"><div class="eyebrow">${icon('pin')} ${p.sample?'Sample decision':'Pinned decision'}</div><h3>${esc(p.title)}</h3><p>${esc(p.text)}</p>${p.path?`<div class="sub">${icon('code')} ${esc(p.path)} · L${p.line}</div>`:''}<div class="actions">${button('unpin','Unpin',null,'text-button',`data-id="${esc(p.id)}"`)}</div></article>`).join(''):'<div class="empty">Pin a chat message to keep a decision here.</div>'}</section>`;}
 function projects(){return `<section class="section"><span class="eyebrow">Your shared spaces</span><h2>One project. One room.</h2><p>Keep each conversation close to its code.</p>${state.projects.map(p=>`<button class="project-card ${p.id===state.active?'selected':''}" data-action="switch" data-id="${esc(p.id)}"><span class="project-icon">${icon('code')}</span><div class="grow"><strong>${esc(p.name)}</strong><div class="sub">${esc(p.repo)}</div></div>${p.id===state.active?'<span class="pill">Current</span>':icon('arrow')}</button>`).join('')}${button('newProject','New local project','plus','secondary')}<p class="small-note">Projects here are local previews. Team sign-in and invitations will connect with the backend.</p></section>`;}
 function openModal(type,extra={}){modal={type,...extra};renderModal();}
 function renderModal(){
  document.getElementById('modal')?.remove();
  const content = {
   agent:()=>`<p>Choose the context for your handoff. This preview uses a local template; no code is sent to an AI service.</p><label class="context-option"><input id="useMessages" type="checkbox" checked> Discussion messages (${room().messages.length})</label><label class="context-option"><input id="useCode" type="checkbox" ${attachment||room().messages.some(m=>m.attachment)?'checked':'disabled'}> ${attachment?'Attached selection':'Latest shared code'}</label><p class="eyebrow">Context preview</p><pre class="context-preview" id="contextPreview"></pre><div class="modal-actions">${button('close','Cancel',null,'secondary')}${button('generate','Create sample draft','spark','primary')}</div>`,
   draft:()=>`<p>Review and edit before sharing. This is a local sample draft, not AI output.</p><textarea class="draft-text" id="draft" aria-label="Editable handoff draft">${esc(modal.text)}</textarea><div class="modal-actions">${button('agent','Back',null,'secondary')}${button('postDraft','Send to room','send','primary')}</div>`,
   pin:()=>`<p>Give this decision a short, useful title.</p><label class="label">Decision title<input class="field" id="pinTitle" maxlength="90" value="${esc(modal.message.text.slice(0,65))}"></label><p>${esc(modal.message.text)}</p><div class="modal-actions">${button('close','Cancel',null,'secondary')}${button('savePin','Save decision','pin','primary')}</div>`,
   newProject:()=>`<p>Create a local space to try the interface.</p><label class="label">Project name<input class="field" id="projectName" maxlength="60" placeholder="e.g. Checkout service"></label><div class="modal-actions">${button('close','Cancel',null,'secondary')}${button('createProject','Create project',null,'primary')}</div>`,
   members:()=>`<p>Sample team for the interface preview.</p><div class="member-row"><span class="avatar me">YO</span><div><strong>You</strong><span class="sub">Local developer</span></div></div><div class="member-row"><span class="avatar">AL</span><div><strong>Alex</strong><span class="sub">Sample teammate</span></div></div><p class="small-note">Real membership and invitations require the backend.</p>`,
   call:()=>`<p>Discuss a blocker without leaving your project.</p><div class="hint-card call-hint"><div><strong>Calls aren’t connected yet</strong><p>Nexconn audio will appear here once the call integration is configured.</p></div></div><div class="modal-actions">${button('close','Got it',null,'primary')}</div>`
  };
  const titles={agent:'A handoff, with context.',draft:'Make it yours.',pin:'Keep the decision.',newProject:'A fresh workspace.',members:'People in this room.',call:'Talk it through.'};
  const wrapper=document.createElement('div');wrapper.id='modal';wrapper.className='modal-backdrop';
  wrapper.innerHTML=`<section class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle"><div class="modal-head"><span class="accent-text">${icon(modal.type==='call'?'phone':modal.type==='pin'?'pin':'spark')}</span><h2 id="modalTitle">${titles[modal.type]}</h2>${button('close','Close dialog','close','icon-button modal-close')}</div>${content[modal.type]()}</section>`;
  app.appendChild(wrapper);
  if(modal.type==='agent'){updateContext();}
  wrapper.querySelector('input:not([disabled]),textarea,button')?.focus();
 }
 function context(){
  const useMessages=document.getElementById('useMessages')?.checked;
  const useCode=document.getElementById('useCode')?.checked;
  const code=useCode?(attachment||[...room().messages].reverse().find(m=>m.attachment)?.attachment):null;
  return {messages:useMessages?room().messages:[],code};
 }
 function updateContext(){const c=context();document.getElementById('contextPreview').textContent=[...c.messages.map(m=>`${m.author}: ${m.text}`),c.code?`${c.code.path}:${c.code.line}\n${c.code.code}`:''].filter(Boolean).join('\n\n')||'No context selected.';}
 function notify(text){document.querySelector('.toast')?.remove();clearTimeout(toastTimer);const el=document.createElement('div');el.className='toast';el.setAttribute('role','status');el.textContent=text;app.appendChild(el);toastTimer=setTimeout(()=>el.remove(),4500);}
 function send(text,ai=false){if(!text.trim()&&!attachment){return;}room().messages.push({id:crypto.randomUUID(),author:'You',initials:'YO',time:new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),text:text.trim(),attachment,reply:replyTo?.author,ai});attachment=null;replyTo=null;composerText='';modal=null;render();const view=document.getElementById('content');view.scrollTop=view.scrollHeight;document.getElementById('compose')?.focus();}
 app.addEventListener('input',e=>{if(e.target.id==='compose'){composerText=e.target.value;}});
 app.addEventListener('change',e=>{if(['useMessages','useCode'].includes(e.target.id)){updateContext();}});
 app.addEventListener('keydown',e=>{
  if(e.target.id==='compose'&&e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();if(composerText.trim().startsWith('@agent')){openModal('agent');}else{send(composerText);}}
  if(e.key==='Escape'&&modal){modal=null;render();}
  if(e.key==='Tab'&&modal){const items=[...document.querySelectorAll('#modal button,#modal input:not([disabled]),#modal textarea')];const first=items[0],last=items[items.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
 });
 app.addEventListener('click',e=>{
  const tab=e.target.closest('[data-tab]');if(tab){state.tab=tab.dataset.tab;render();return;}
  const b=e.target.closest('[data-action]');if(!b){return;}const action=b.dataset.action,id=b.dataset.id;
  if(action==='resolve'){room().resolved=!room().resolved;render();}if(action==='projects'){state.tab='projects';render();}
  if(action==='send'){if(composerText.trim().startsWith('@agent')){openModal('agent');}else{send(composerText);}}
  if(action==='attach'){vscode.postMessage({type:'selection'});}
  if(action==='detach'){attachment=null;render();}
  if(action==='cancelReply'){replyTo=null;render();}
  if(action==='reply'){replyTo=room().messages.find(m=>m.id===id);render();document.getElementById('compose').focus();}
  if(action==='open'){const a=room().messages.find(m=>m.id===id)?.attachment;if(a){vscode.postMessage({type:'openFile',path:a.path,line:a.line});}}
  if(action==='pin'){const m=room().messages.find(m=>m.id===id);if(room().pins.some(p=>p.messageId===id)){notify('Already saved in Decisions.');}else{openModal('pin',{message:m});}}
  if(action==='savePin'){const title=document.getElementById('pinTitle').value.trim();if(!title){notify('Add a title for this decision.');return;}const m=modal.message;room().pins.push({id:crypto.randomUUID(),messageId:m.id,title,text:m.text,path:m.attachment?.path,line:m.attachment?.line});modal=null;render();notify('Saved in Decisions.');}
  if(action==='unpin'){room().pins=room().pins.filter(p=>p.id!==id);render();}
  if(['agent','members','call','newProject'].includes(action)){openModal(action);}
  if(action==='close'){modal=null;render();document.getElementById('compose')?.focus();}
  if(action==='generate'){const c=context();if(!c.messages.length&&!c.code){notify('Choose at least one context input.');return;}const text=`Debugging handoff\n\nContext\n${c.messages.length?c.messages.map(m=>`${m.author}: ${m.text}`).join('\n'):'See the attached code selection.'}\n\nCode reference\n${c.code?`${c.code.path}, lines ${c.code.line}–${c.code.endLine}\n${c.code.code}`:'No code included.'}\n\nStill needed\nConfirm the reproduction steps, expected behavior, and any fixes already attempted.\n\nNext step\nReview the context together and agree on a regression check.`;openModal('draft',{text});}
  if(action==='postDraft'){const text=document.getElementById('draft').value;if(!text.trim()){notify('Write a draft before sending.');return;}send(text,true);}
  if(action==='createProject'){const name=document.getElementById('projectName').value.trim();if(!name){notify('Enter a project name.');return;}const pid=crypto.randomUUID();state.projects.push({id:pid,name,repo:'Local preview · repository not linked'});state.rooms[pid]={messages:[],pins:[],resolved:false};state.active=pid;state.tab='chat';attachment=null;replyTo=null;composerText='';modal=null;render();}
  if(action==='switch'){state.active=id;state.tab='chat';attachment=null;replyTo=null;composerText='';render();}
 });
 window.addEventListener('message',event=>{const data=event.data;if(data?.type==='notice'){notify(data.text);}if(data?.type==='selection'&&data.attachment){attachment=data.attachment;state.tab='chat';render();document.getElementById('compose')?.focus();}});
 render();
})();

