/* Host owns Git and membership; the Nexconn bridge owns chat transport. */
(() => {
 const host = acquireVsCodeApi();
 window.startNexconnBridge?.(host);
 const cache = host.getState() || {};
 let state = { rooms: [], mode: 'nexconn', displayName: 'Developer' }, tab = cache.tab || 'connect';
 let connectTab = 'create', draft = cache.draft || '', attachment = cache.attachment || null, replyTo = cache.replyTo || null;
 let roomName = '', invite = '', busy = false, pending = null, retryId = null, showRooms = false, last = '', toastTimer;
 const app = document.getElementById('app');
 const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const shapes = {
  code:'<path d="m8 8-4 4 4 4m8-8 4 4-4 4m-3-13-2 18"/>',
  folder:'<path d="M3 7V4h7l3 3h8v3M3 7h18l-3 13H2Z"/>',
  chat:'<path d="M4 4h16v13H9l-5 4V4Z"/><path d="M8 8h8M8 12h6"/>',
  branch:'<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M6 7v10m12-10a10 10 0 0 1-10 8H6"/>',
  down:'<path d="m8 9 4-4 4 4m-8 6 4 4 4-4"/>', plus:'<circle cx="12" cy="12" r="9"/><path d="M12 7v10M7 12h10"/>',
  arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>', check:'<circle cx="12" cy="12" r="9"/><path d="m7 12 3 3 7-7"/>',
  link:'<path d="M10 8H7a4 4 0 0 0 0 8h3m4-8h3a4 4 0 0 1 0 8h-3M8 12h8"/>', copy:'<rect x="8" y="3" width="12" height="14" rx="1"/><path d="M16 21H4V7"/>',
  shield:'<path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6l8-4Z"/><path d="m8 11 3 3 5-6"/>',
  refresh:'<path d="M20 9a8 8 0 1 0 0 6M20 3v6h-6"/>', settings:'<path d="M4 7h16M4 17h16"/><circle cx="8" cy="7" r="3"/><circle cx="16" cy="17" r="3"/>',
  close:'<path d="m6 6 12 12M6 18 18 6"/>', send:'<path d="M12 20V4m-6 6 6-6 6 6"/>',
  reply:'<path d="m9 5-6 6 6 6m-6-6h11a7 7 0 0 1 7 7"/>', open:'<path d="M14 3h7v7m0-7L10 14M10 5H3v16h16v-7"/>',
  people:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m2-16a3 3 0 0 1 0 6m2 10v-3a6 6 0 0 0-2-4"/>'
 };
 const icon = n => `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${shapes[n] || shapes.code}</svg>`;
 const button = (action, text, glyph, cls = 'quiet', attrs = '') => `<button type="button" data-action="${action}" class="${cls}" ${attrs}>${glyph ? icon(glyph) : ''}<span>${esc(text)}</span></button>`;
 const room = () => state.rooms.find(r => r.id === state.active);
 const save = () => host.setState({ tab, draft, attachment, replyTo });
 function notify(text) { document.querySelector('.toast')?.remove(); clearTimeout(toastTimer); const el = document.createElement('div'); el.className='toast'; el.role='status'; el.textContent=text; document.body.append(el); toastTimer=setTimeout(()=>el.remove(),6500); }
 function request(type, body = {}) {
  if (busy) { return; }
  busy = true; const operation = type === 'send' && retryId ? retryId : crypto.randomUUID();
  if (type === 'send') { retryId = operation; }
  pending = { type, operation }; render(); host.postMessage({type, ...body, operation});
 }
 function repoCard() {
  const r = state.repo;
  if (!r) { return `<div class="card"><h3>Open your project</h3><p>Open a folder in VS Code to detect its repository.</p>${button('chooseRepository','Open folder','folder','secondary')}</div>`; }
  return `<div class="card repo-card"><div class="row"><h3>${icon('folder')} ${esc(r.name)}</h3><span class="tag ${r.detected?'green':''}">${r.detected?'● Detected Git repo':'No Git repository'}</span></div><dl><dt>Local path</dt><dd title="${esc(r.root)}">${esc(r.root)}</dd><dt>Head & commit</dt><dd class="blue">${icon('branch')} ${esc(r.branch)} <span class="muted">@</span> ${esc(r.commit || '—')}</dd><dt>Stack</dt><dd>${esc(r.stack)}</dd></dl>${r.commit?`<div class="latest"><span class="eyebrow">Latest commit</span><p>${esc(r.summary)}</p><span class="muted">${esc(r.author)} · ${esc(new Date(r.committedAt).toLocaleString())}</span></div>`:''}</div>`;
 }
 function connect() {
  const r = room();
  return `<section class="section"><div class="section-heading"><h1>Connect your project <span class="blue">ϟ</span></h1>${button('refresh','Refresh','refresh','icon-button')}</div><p class="lead">The room keeps this project’s conversations and shared code together across your team.</p>${repoCard()}<div class="segmented"><button data-connect="create" class="${connectTab==='create'?'selected':''}">Create team room</button><button data-connect="join" class="${connectTab==='join'?'selected':''}">Join with invite</button></div>${connectTab==='create'?`<h3 class="form-title">Start a fresh collaboration room</h3><p class="muted">Create a Nexconn group and invite your teammates.</p><form id="create-form" class="card"><label for="room-name">Room name <span class="muted mono">repository sync</span></label><div class="input-wrap">${icon('chat')}<input id="room-name" required maxlength="64" placeholder="${esc(state.repo?.name || 'Project room')}" value="${esc(roomName)}" ${busy?'disabled':''}></div><div class="access">${icon('shield')}<span>Private to invited room members</span></div><button class="primary full" type="submit" ${busy||!state.repo?'disabled':''}>${icon('plus')}${busy?'Creating…':'Create Room'}</button></form>`:`<h3 class="form-title">Bring your context with you</h3><p class="muted">Use an invitation code from a teammate on the same CodeJam backend.</p><form id="join-form" class="card"><label for="invite">Invitation code</label><input id="invite" required maxlength="200" placeholder="cdj-…" value="${esc(invite)}"><button class="primary full" type="submit" ${busy?'disabled':''}>${icon('link')}${busy?'Joining…':'Join Room'}</button></form>`}${r?`<div class="card success"><h3>${icon('check')} Room ready: ${esc(r.name)}</h3><p>Your Nexconn room is ready. Share this private invitation code with your team.</p>${r.invite?`<div class="invite"><code>${esc(r.invite)}</code>${button('copyInvite','Copy','copy','secondary')}</div>`:''}<div class="row members-line">${avatars(r)}<span class="muted">${r.members.length} ${r.members.length===1?'member':'members'}</span></div>${button('openChat','Open project chat','arrow','inverted full')}</div>`:''}<div class="connect-footer"><span>CodeJam · base build</span>${button('settings','Settings','settings','text-button')}</div></section>`;
 }
 function avatars(r) { return `<div class="avatars">${r.members.slice(0,5).map((m,i)=>`<span class="avatar color-${i%3}" title="${esc(m.name)}">${esc(m.name[0]?.toUpperCase())}</span>`).join('')}</div>`; }
 function codeCard(a,id) {
  return `<div class="code-card"><div class="code-top">${icon('code')}<span title="${esc(a.path)}">${esc(a.path)}</span><code>L${a.line}–${a.endLine}</code>${button('openFile','Open in editor','open','text-button',`data-id="${esc(id)}"`)}</div><pre><code>${esc(a.code)}</code></pre><div class="code-meta"><span>${icon('branch')} ${esc(a.branch)}</span><span>${esc(a.commit || 'uncommitted')}</span></div></div>`;
 }
 function message(m,r) {
  const replied = r.messages.find(x=>x.id===m.replyTo);
  return `<article class="message" id="message-${esc(m.id)}"><div class="avatar ${m.userId===state.userId?'color-0':'color-1'}">${esc(m.author[0]?.toUpperCase())}</div><div class="message-body"><div class="message-head"><strong>${esc(m.author)}</strong><time title="${esc(new Date(m.createdAt).toLocaleString())}">${esc(new Date(m.createdAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}))}</time></div>${replied?`<div class="quoted">Replying to ${esc(replied.author)}: ${esc(replied.text.slice(0,100) || 'Shared code')}</div>`:''}${m.text?`<p>${esc(m.text)}</p>`:''}${m.attachment?codeCard(m.attachment,m.id):''}<div class="actions">${button('reply','Reply','reply','text-button',`data-id="${esc(m.id)}"`)}</div></div></article>`;
 }
 function chat() {
  const r = room(); if (!r) { return ''; }
  let previousDay = '';
  const messages = r.messages.map(m=>{ const date = new Date(m.createdAt).toLocaleDateString([],{month:'short',day:'numeric',year:'numeric'}); const divider = date!==previousDay?`<div class="day"><span>${esc(date)}</span></div>`:''; previousDay=date; return divider+message(m,r); }).join('');
  return `<div class="room-bar"><div class="row"><strong>${esc(r.name)}</strong>${avatars(r)}${button('team','Team','people','quiet')}</div><div class="branch-strip"><span>${icon('branch')} ${esc(state.repo?.branch || 'No repository')}</span><span class="${state.repo?.dirty?'muted':'green'}">${state.repo?.detected?(state.repo.dirty?'Uncommitted changes':'Clean working tree'):'Local workspace'}</span></div></div><main class="messages" id="messages" aria-label="Room messages" aria-live="polite">${r.hasMore?button('loadOlder','Load earlier messages','refresh','text-button full',busy?'disabled':''):''}${messages||`<div class="empty"><span class="empty-icon">${icon('chat')}</span><h2>A room for the work.</h2><p>Ask a question. Share a few lines.<br>Keep the conversation beside your code.</p><span class="tag"># ${esc(r.name)}</span></div>`}</main>${composer()}`;
 }
 function composer() {
  return `<div class="composer-wrap">${replyTo?`<div class="attachment">${icon('reply')}<span>Replying to ${esc(room()?.messages.find(m=>m.id===replyTo)?.author || 'message')}</span>${button('cancelReply','Cancel reply','close','icon-button')}</div>`:''}${attachment?`<div class="attachment">${icon('code')}<span>${esc(attachment.path)}:${attachment.line} <code>${esc(attachment.branch)}</code></span>${button('detach','Remove code','close','icon-button')}</div>`:''}<form id="message-form" class="composer"><textarea id="compose" maxlength="12000" placeholder="Reply or share code with your team…" aria-label="Message room" ${busy?'disabled':''}>${esc(draft)}</textarea><div class="composer-tools">${button('attach','Attach selected code','code','icon-button',busy?'disabled':'')}<span class="muted mono">${attachment?'Code attached':'Selected code + context'}</span><button type="submit" class="primary send" ${busy||(!draft.trim()&&!attachment)?'disabled':''}>${busy?'Sending…':'Send'} ${icon('send')}</button></div></form><div class="footer"><span>Ctrl / ⌘ + Enter to send</span><span>Nexconn Chat SDK</span></div></div>`;
 }
 function team() { const r=room(); return `<main class="section"><span class="eyebrow">In this room</span><h1>Your team</h1><p class="muted">Members can read this room’s conversation and shared code.</p>${r.members.map((m,i)=>`<div class="member"><span class="avatar color-${i%3}">${esc(m.name[0]?.toUpperCase())}</span><strong>${esc(m.name)}</strong><span class="muted">Member</span></div>`).join('')}${r.invite?`<div class="card"><h3>Invite a teammate</h3><p class="muted">Use the same server URL and paste this code under Connect → Join with invite.</p><div class="invite"><code>${esc(r.invite)}</code>${button('copyInvite','Copy code','copy','secondary')}</div></div>`:`<div class="card"><p>Choose a Nexconn room to invite teammates.</p>${button('settings','Configure server','settings','secondary')}</div>`}</main>`; }
 function render() {
  save();
  const focused=document.activeElement, focusId=focused?.id, start=focused?.selectionStart, end=focused?.selectionEnd;
  const scroll=document.getElementById('messages'), oldScroll=scroll?.scrollTop||0, atBottom=!scroll||scroll.scrollHeight-scroll.scrollTop-scroll.clientHeight<70;
  const r=room(), connected=state.connected===true;
  if (!r && tab!=='connect') { tab='connect'; }
  app.innerHTML=`<header><div class="brand"><span class="brand-mark">${icon('code')}</span><strong>CODEJAM</strong><span class="version">BASE</span><span class="status ${connected?'green':''}">● ${connected?'NEXCONN LIVE':'CONNECTING'}</span>${button('settings','Settings','settings','icon-button')}</div><button class="project-switch" data-action="chooseRepository" title="Choose repository"><span>${icon('folder')} ${esc(state.repo?.name || 'Open a project')}</span><code>${esc(state.repo?.detected?state.repo.branch:'workspace')}</code>${icon('down')}</button><nav aria-label="Workspace navigation">${['connect','chat','team'].map(t=>`<button data-tab="${t}" class="${tab===t?'active':''}" ${t!=='connect'&&!r?'disabled':''}>${t==='chat'?icon('chat'):''}${t[0].toUpperCase()+t.slice(1)}${t==='team'&&r?`<span class="count">${r.members.length}</span>`:''}</button>`).join('')}${button('rooms','Rooms','down','room-switch',busy?'disabled':'')}</nav>${showRooms?`<div class="room-menu">${state.rooms.map(x=>button('switchRoom',x.name,'chat','room-option',`data-id="${esc(x.id)}"`)).join('')||'<p>No rooms yet.</p>'}${button('newRoom','Create or join room','plus','room-option')}</div>`:''}</header>${!connected?`<div class="connection-error" role="status">${esc(state.connection||'Connecting…')}${button('refresh','Reconnect','refresh','text-button')}</div>`:''}${tab==='connect'?`<main class="view">${connect()}</main>`:tab==='chat'?chat():team()}`;
  const nextScroll=document.getElementById('messages'); if(nextScroll){nextScroll.scrollTop=atBottom?nextScroll.scrollHeight:oldScroll;}
  const next=document.getElementById(focusId);if(next&&!next.disabled){next.focus();if(typeof start==='number'&&next.setSelectionRange){next.setSelectionRange(start,end);}}
 }
 function send() { if(!busy&&(draft.trim()||attachment)){request('send',{roomId:state.active,text:draft,attachment,replyTo});} }
 app.addEventListener('input',e=>{
  if(e.target.id==='compose'){draft=e.target.value;retryId=null;save();const sendButton=app.querySelector('.send');if(sendButton){sendButton.disabled=!draft.trim()&&!attachment;}}
  if(e.target.id==='room-name'){roomName=e.target.value;}
  if(e.target.id==='invite'){invite=e.target.value;}
 });
 app.addEventListener('submit',e=>{e.preventDefault();if(e.target.id==='message-form'){send();}if(e.target.id==='create-form'){request('createRoom',{name:roomName.trim()||state.repo?.name});}if(e.target.id==='join-form'){request('joinRoom',{invite});}});
 app.addEventListener('keydown',e=>{if(e.target.id==='compose'&&e.key==='Enter'&&(e.ctrlKey||e.metaKey)&&!e.isComposing){e.preventDefault();send();}});
 app.addEventListener('click',e=>{
  const t=e.target.closest('[data-tab]');if(t&&!t.disabled&&!busy){tab=t.dataset.tab;showRooms=false;render();return;}
  const ct=e.target.closest('[data-connect]');if(ct&&!busy){connectTab=ct.dataset.connect;render();return;}
  const b=e.target.closest('[data-action]');if(!b||b.disabled){return;}const action=b.dataset.action;
  if(action==='rooms'){showRooms=!showRooms;render();}
  else if(action==='newRoom'){showRooms=false;tab='connect';render();}
  else if(action==='openChat'){tab='chat';render();document.getElementById('compose')?.focus();}
  else if(action==='team'){tab='team';render();}
  else if(action==='switchRoom'){if(draft||attachment){notify('Send or clear your current draft before switching rooms.');return;}showRooms=false;replyTo=null;tab='chat';request('switchRoom',{id:b.dataset.id});}
  else if(action==='reply'){replyTo=b.dataset.id;render();document.getElementById('compose')?.focus();}
  else if(action==='cancelReply'){replyTo=null;render();}
  else if(action==='detach'){attachment=null;retryId=null;render();}
  else if(action==='attach'){host.postMessage({type:'selection'});}
  else if(action==='loadOlder'){request('loadOlder');}
  else if(action==='openFile'){host.postMessage({type:'openFile',id:b.dataset.id});}
  else {host.postMessage({type:action});}
 });
 window.addEventListener('message',e=>{
  const data=e.data;
  if(data?.type==='state'){
   const signature=JSON.stringify(data);if(signature===last){return;}last=signature;
   if(state.active&&state.active!==data.active){draft='';attachment=null;replyTo=null;retryId=null;}
   if(!state.repo&&data.repo&&!roomName){roomName=data.repo.name;}
   state=data;render();
  }
  if(data?.type==='notice'){notify(data.text);}
  if(data?.type==='selection'){attachment=data.attachment;tab='chat';render();document.getElementById('compose')?.focus();}
  if(data?.type==='result'&&data.operation===pending?.operation){
   const type=pending.type;busy=false;pending=null;
   if(data.ok&&type==='send'){draft='';attachment=null;replyTo=null;retryId=null;}
   if(data.ok&&type==='joinRoom'){tab='chat';invite='';}
   if(data.ok&&type==='createRoom'){tab='connect';roomName='';}
   render();if(type==='send'){document.getElementById('compose')?.focus();}
  }
 });
 host.postMessage({type:'ready'});
})();
