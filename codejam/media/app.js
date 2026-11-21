(() => {
 let forceSignIn=false;const draftSlots=new Map();
 function changeThread(id){if(id!==threadId){showAgentContext=false;resetAgent();}draftSlots.set(threadId||'',{draft,attachment,replyTo,retryId});threadId=id;const slot=draftSlots.get(id||'');draft=slot?.draft||'';attachment=slot?.attachment||null;replyTo=slot?.replyTo||null;retryId=slot?.retryId||null;}
 const host=acquireVsCodeApi();window.startNexconnBridge?.(host);
 const saved=host.getState()||{};
 let state={rooms:[]},tab=saved.tab||'connect',threadId=saved.threadId||null,draft=saved.draft||'',attachment=saved.attachment||null,replyTo=saved.replyTo||null;
 let discussionFilter='open',decisionFilter='all',modalOrigin=null;const scrollPositions=new Map();
 let roomName='',invite='',connectTab='create',busy=false,pending=null,retryId=null,modal=null,showRooms=false,last='',search='',toastTimer;
 let authMode='login',authEmail='',authName='',aiOptions={code:false,messages:false,diff:false},referenceStatus={};
 let agentRequest=null,agentResult=null,agentSourceId=null,agentScope='',showAgentContext=false;
 let aiGrants=saved.aiGrants&&typeof saved.aiGrants==='object'?saved.aiGrants:{};
 let voice=null,voiceUrl=null,accountLanguage='en';
 const translationLanguages={en:'English',hi:'Hindi',te:'Telugu'},translations=new Map();
 const preferredLanguage=()=>Object.hasOwn(translationLanguages,state.user?.language)?state.user.language:'en';
 const languageSelect=(id,value)=>'<select id="'+id+'" aria-label="Translation language" '+(busy?'disabled':'')+'>'+Object.entries(translationLanguages).map(([code,label])=>'<option value="'+code+'" '+(code===value?'selected':'')+'>'+esc(label)+'</option>').join('')+'</select>';
 const translationKey=id=>JSON.stringify([state.userId,state.active,id]);
 const app=document.getElementById('app'),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const paths={code:'m8 8-4 4 4 4m8-8 4 4-4 4m-3-13-2 18',chat:'M4 4h16v13H9l-5 4V4ZM8 8h8M8 12h6',folder:'M3 7V4h7l3 3h8v3M3 7h18l-3 13H2Z',branch:'M6 3v18m12-18v4a9 9 0 0 1-9 9H6',down:'m8 9 4-4 4 4m-8 6 4 4 4-4',plus:'M12 4v16M4 12h16',arrow:'M4 12h16m-6-6 6 6-6 6',back:'M20 12H4m6-6-6 6 6 6',check:'m5 12 4 4L20 5',link:'M10 8H7a4 4 0 0 0 0 8h3m4-8h3a4 4 0 0 1 0 8h-3M8 12h8',copy:'M8 3h12v14H8ZM16 21H4V7',shield:'m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6l8-4Zm-4 9 3 3 5-6',refresh:'M20 9a8 8 0 1 0 0 6M20 3v6h-6',settings:'M4 7h16M4 17h16M8 4v6m8 4v6',close:'m6 6 12 12M6 18 18 6',send:'M12 20V4m-6 6 6-6 6 6',reply:'m9 5-6 6 6 6m-6-6h11a7 7 0 0 1 7 7',open:'M14 3h7v7m0-7L10 14M10 5H3v16h16v-7',pin:'m15 3 6 6-4 1-4 5-1 4-7-7 4-1 5-4 1-4ZM8 16l-5 5',spark:'m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4ZM20 2v4m-2-2h4',headphones:'M3 14v-3a9 9 0 0 1 18 0v3M3 12h4v9H3Zm14 0h4v9h-4Z',mic:'M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0ZM5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8',user:'M8 8a4 4 0 1 0 8 0 4 4 0 0 0-8 0ZM4 22v-2a8 8 0 0 1 16 0v2',search:'M4 10a6 6 0 1 0 12 0 6 6 0 0 0-12 0Zm11 5 6 6',diff:'M7 3v8M3 7h8m2 10h8',chevron:'m9 5 7 7-7 7',hash:'M5 9h14M4 15h14M11 3 7 21M17 3l-4 18',more:'M5 12h.01M12 12h.01M19 12h.01',smile:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM8 14s1 3 4 3 4-3 4-3M8 9h.01M16 9h.01'};
 const icon=n=>`<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="${paths[n]||paths.code}"/></svg>`;
 const button=(action,label,glyph,cls='quiet',attrs='')=>`<button type="button" data-action="${action}" class="${cls}" aria-label="${esc(label)}" title="${esc(label)}" ${attrs}>${glyph?icon(glyph):''}<span>${esc(label)}</span></button>`;
 const room=()=>state.rooms.find(r=>r.id===state.active),discussion=()=>room()?.discussions?.find(d=>d.id===threadId);
 const isOwner=r=>(r?.ownerId||r?.members[0]?.id)===state.userId;
 const source=id=>[...(room()?.messages||[]),...(room()?.discussions||[]).map(d=>d.source),...(room()?.pins||[]).map(p=>p.source)].find(m=>m.id===id);
 const meta=m=>`data-id="${esc(m.id)}"`,initials=n=>String(n||'?').split(/\s+/).map(s=>s[0]).join('').slice(0,2).toUpperCase(),stamp=d=>new Date(d).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
 const format=t=>esc(t).replace(/`([^`\n]+)`/g,'<code class="inline-code">$1</code>').replace(/\*\*([^*\n]+)\*\*/g,'<strong>$1</strong>').replace(/(^|\s)(@[\w.-]+)/g,'$1<span class="mention">$2</span>');
 function highlight(code){return String(code).split(/(\b(?:const|let|function|async|await|return|if|else|throw|new|export|import|true|false|null|class)\b|'[^'\n]*'|"[^"\n]*")/g).map((v,i)=>i%2?`<span class="${/^['"]/.test(v)?'syntax-string':'syntax-key'}">${esc(v)}</span>`:esc(v)).join('');}
 function save(){host.setState({tab,threadId,draft,attachment,replyTo,aiGrants});}
 function notify(text){document.querySelector('.toast')?.remove();clearTimeout(toastTimer);const el=document.createElement('div');el.className='toast';el.role='status';el.textContent=text;document.body.append(el);toastTimer=setTimeout(()=>el.remove(),7000);}
 function request(type,body={}){if(busy){return;}busy=true;const operation=type==='send'&&retryId?retryId:crypto.randomUUID();if(type==='send'){retryId=operation;}pending={type,operation};render();host.postMessage({type,...body,operation});}
 function avatars(r){return `<div class="avatars">${r.members.slice(0,5).map((m,i)=>`<span class="avatar color-${i%3}" title="${esc(m.name)}">${esc(initials(m.name))}</span>`).join('')}</div>`;}
 function authScreen(){return `<main class="view"><section class="section auth-screen"><h1>CodeJam workspace</h1><div class="segmented"><button data-auth="login" class="${authMode==='login'?'selected':''}">Sign in</button><button data-auth="signup" class="${authMode==='signup'?'selected':''}">Create account</button></div><form id="auth-form" class="card">${authMode==='signup'?`<label for="auth-name">Your name</label><input id="auth-name" required maxlength="60" value="${esc(authName)}" autocomplete="name">`:''}<label for="auth-email">Email</label><input id="auth-email" type="email" required autocomplete="email" value="${esc(authEmail)}" placeholder="you@team.com"><label for="auth-password">Password</label><input id="auth-password" type="password" required minlength="6" maxlength="256" autocomplete="${authMode==='signup'?'new-password':'current-password'}" placeholder="At least 6 characters"><button class="primary full auth-submit" type="submit" ${busy?'disabled':''}>${busy?'Connecting…':authMode==='signup'?'Create account':'Sign in'} ${icon('arrow')}</button></form><div class="or-divider">or</div>${button('googleSignIn',busy?'Complete sign-in in your browser…':'Continue with Google','user','secondary full',busy?'disabled':'')}<p class="auth-note">Firebase Authentication · Your password is never saved in the extension.</p></section></main>`;}
 function repoCard(){const r=state.repo;if(!r){return `<div class="card"><h3>Open your project</h3><p class="muted">Open a folder to detect its repository.</p>${button('chooseRepository','Open folder','folder','secondary')}</div>`;}return `<div class="card repo-card"><div class="row"><h3>${icon('folder')} ${esc(r.name)}</h3><span class="tag ${r.detected?'green':''}">${r.detected?'● Detected Git repo':'Local folder'}</span></div><dl><dt>Local path</dt><dd title="${esc(r.root)}">${esc(r.root)}</dd><dt>Head & commit</dt><dd class="blue">${icon('branch')} ${esc(r.branch)} @ ${esc(r.commit||'—')}</dd><dt>Working tree</dt><dd class="${r.dirty?'':'green'}">${r.dirty?'Uncommitted changes':'Clean'}</dd><dt>Stack</dt><dd>${esc(r.stack)}</dd></dl>${r.commit?`<div class="latest"><span class="eyebrow">Latest commit</span><p>${esc(r.summary)}</p><span class="muted">${esc(r.author)} · ${esc(new Date(r.committedAt).toLocaleString())}</span></div>`:''}</div>`;}
 function connect(){const r=room();return `<section class="section"><div class="section-heading"><h1>Room setup</h1>${button('refresh','Refresh','refresh','icon-button')}</div>${repoCard()}<div class="segmented"><button data-connect="create" class="${connectTab==='create'?'selected':''}">Create team room</button><button data-connect="join" class="${connectTab==='join'?'selected':''}">Join with invite</button></div>${connectTab==='create'?`<h3 class="form-title">Create a room</h3><p class="muted">Choose a name, then invite your teammates.</p><form id="create-form" class="card"><label for="room-name">Room name</label><div class="input-wrap">${icon('chat')}<input id="room-name" required maxlength="64" value="${esc(roomName)}" placeholder="${esc(state.repo?.name||'Project room')}" ${busy?'disabled':''}></div><div class="access">${icon('shield')} Invitation required to join</div><button class="primary full" type="submit" ${busy||!state.repo?'disabled':''}>${icon('plus')}${busy?'Creating…':'Create Room'}</button></form>`:`<h3 class="form-title">Join a room</h3><p class="muted">Paste the invitation code from your teammate.</p><form id="join-form" class="card"><label for="invite">Invitation code</label><input id="invite" required maxlength="200" placeholder="cdj-…" value="${esc(invite)}"><button class="primary full" type="submit" ${busy?'disabled':''}>${icon('link')}${busy?'Joining…':'Join Room'}</button></form>`}${r?`<div class="card success"><h3>${icon('check')} Room ready: ${esc(r.name)}</h3><p>Your room is ready. Invite your teammates and start building together.</p><div class="invite"><code>${esc(r.invite||'')}</code>${button('copyInvite','Copy','copy','secondary')}</div><div class="row members-line">${avatars(r)}<span class="muted">${r.members.length} ${r.members.length===1?'member':'members'}</span></div>${button('openChat','Open project chat','arrow','inverted full')}</div>`:''}<div class="connect-footer"><span>Nexconn + Firestore</span>${button('settings','Settings','settings','text-button')}</div></section>`;}
 function codeCard(a,id,detail=false){const differs=referenceStatus[id]??(state.repo?.commit!==a.commit);return `<div class="code-card ${detail?'detail-code':''}"><div class="code-top">${icon('code')}<span title="${esc(a.path)}">${esc(a.path)}</span><code>L${a.line}–${a.endLine}</code>${button('openFile','Open in editor','open','text-button',`data-id="${esc(id)}"`)}</div>${detail?`<div class="code-meta"><span>${icon('branch')} ${esc(a.branch)}</span><span>${esc(a.commit||'uncommitted')}</span></div>${differs?`<div class="revision-warning">△ Working copy differs from the shared revision ${button('showDiff','Show diff','diff','text-button',`data-id="${esc(id)}"`)}</div>`:''}`:''}<div class="numbered-code">${String(a.code).split('\n').map((line,i)=>`<div><span class="line-number">${a.line+i}</span><code>${highlight(line)||' '}</code></div>`).join('')}</div>${!detail?`<div class="code-meta"><span>${icon('branch')} ${esc(a.branch)}</span><span>${esc(a.commit||'uncommitted')}</span></div>`:''}</div>`;}
 const symbols={eyes:'👀',search:'🔎',target:'🎯',rocket:'🚀',hands:'🙌',check:'✓'};
 function reactions(m){const values=room()?.reactions?.find(r=>r.id===m.id)?.values||{};const entries=Object.entries(values).filter(([,ids])=>ids.length);return entries.length?`<div class="reactions">${entries.map(([name,ids])=>`<button class="reaction ${ids.includes(state.userId)?'mine':''}" data-action="reaction" ${meta(m)} data-emoji="${esc(name)}" aria-label="${esc(name)} reaction, ${ids.length}${ids.includes(state.userId)?', selected':''}" aria-pressed="${ids.includes(state.userId)}">${symbols[name]||esc(name)} ${ids.length}</button>`).join('')}</div>`:'';}
 function message(m,r,detail=false){const quoted=source(m.replyTo),d=r.discussions?.find(d=>d.source.id===m.id),count=r.messages.filter(x=>d?x.discussionId===d.id:x.replyTo===m.id).length;return `<article class="message ${m.mentions?.includes(state.userId)?'mentioned-message':''}" id="message-${esc(m.id)}"><div class="avatar ${m.userId===state.userId?'color-0':'color-1'}">${m.agent?icon('spark'):esc(initials(m.author))}</div><div class="message-body"><div class="message-head"><strong>${m.agent?'Agent':esc(m.author)}</strong>${m.agent?`<span class="agent-attribution">Asked by ${esc(m.author)} / ${esc(m.agent.model)}</span>`:''}<time datetime="${esc(m.createdAt)}">${esc(stamp(m.createdAt))}</time>${m.reviewedDraft?'<span class="reviewed-tag">Reviewed AI draft</span>':''}</div>${quoted&&!detail?`<div class="quoted">Replying to ${esc(quoted.author)}: ${esc(quoted.voice?'Voice message':quoted.text.slice(0,100))}</div>`:''}${m.agent?`<p class="agent-question">${esc(m.agent.question)}</p>${agentMarkup(m.text)}`:m.text?`<p>${format(m.text)}</p>`:''}${translationMarkup(m)}${m.voice?voicePlayer(m.voice,m.id):''}${m.attachment&&!detail?codeCard(m.attachment,m.id):''}${d&&!detail?button('discuss',`${count} ${count===1?'reply':'replies'} · ${d.status==='resolved'?'Resolved':'Open discussion'}`,'chat','thread-link',meta(m)):''}${detail?'':messageDecisions(r,m.id)}${reactions(m)}<div class="message-actions" aria-label="Message actions">${button('reply','Reply','reply','icon-button',meta(m))}${button('react','Add reaction','smile','icon-button',meta(m))}${button('messageMenu','More actions','more','icon-button',meta(m))}</div></div></article>`;}
 function translationMarkup(message){
  const translated=translations.get(translationKey(message.id));
  return translated?'<aside class="message-translation" aria-label="Private translation"><div><strong>'+esc(translationLanguages[translated.language])+' / Only you</strong>'+button('hideTranslation','Hide translation','close','icon-button','data-id="'+esc(message.id)+'"')+'</div><p>'+esc(translated.text)+'</p></aside>':'';
 }
 function voicePlayer(audio,key){
  try{const url=new URL(audio.url);if(url.protocol!=='https:'||url.username||url.password){return '';}}catch{return '';}
  const bars='<i></i>'.repeat(38);
  return `<div class="voice-message" role="group" aria-label="Voice message" data-duration="${Number(audio.duration)||0}"><audio hidden preload="none" src="${esc(audio.url)}" data-audio-key="${esc(key)}"></audio><button type="button" class="voice-play" data-voice-toggle aria-label="Play voice message" title="Play voice message">${voicePlayIcon(false)}</button><div class="voice-track"><div class="voice-wave" aria-hidden="true"><div>${bars}</div><div class="voice-wave-fill">${bars}</div></div><input class="voice-seek" type="range" min="0" max="100" step="0.1" value="0" aria-label="Seek voice message" disabled><div class="voice-timing"><span class="voice-elapsed">0:00</span><span class="voice-duration">${esc(voiceTime(audio.duration))}</span></div></div><button type="button" class="voice-speed" data-voice-speed aria-label="Playback speed: 1x" title="Change playback speed">1x</button><span class="voice-playback-error" role="status" hidden></span></div>`;
 }
 function voicePlayIcon(playing){return '<svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">'+(playing?'<path d="M7 5h4v14H7zm6 0h4v14h-4z"/>':'<path d="m9 5 11 7-11 7z"/>')+'</svg>';}
 function syncVoicePlayer(audio){
  const player=audio.closest('.voice-message');if(!player){return;}
  const duration=Number.isFinite(audio.duration)&&audio.duration>0?audio.duration:Number(player.dataset.duration)||0;
  const elapsed=Number.isFinite(audio.currentTime)?audio.currentTime:0,percent=duration?Math.min(100,elapsed/duration*100):0;
  const toggle=player.querySelector('[data-voice-toggle]'),label=audio.paused?'Play voice message':'Pause voice message';
  toggle.innerHTML=voicePlayIcon(!audio.paused);toggle.setAttribute('aria-label',label);toggle.title=label;
  player.querySelector('.voice-elapsed').textContent=voiceTime(elapsed);
  player.querySelector('.voice-duration').textContent=voiceTime(duration);
  player.querySelector('.voice-wave-fill').style.clipPath='inset(0 '+(100-percent)+'% 0 0)';
  const seek=player.querySelector('.voice-seek');seek.value=percent;seek.disabled=!Number.isFinite(audio.duration)||audio.duration<=0;
  seek.setAttribute('aria-valuetext',voiceTime(elapsed)+' of '+voiceTime(duration));
  const speed=player.querySelector('[data-voice-speed]');speed.textContent=audio.playbackRate+'x';speed.setAttribute('aria-label','Playback speed: '+audio.playbackRate+'x');
  const error=player.querySelector('.voice-playback-error');error.hidden=!audio.dataset.voiceError;error.textContent=audio.dataset.voiceError||'';
 }
 for(const event of ['timeupdate','loadedmetadata','durationchange','play','pause','ended','ratechange','error']){app.addEventListener(event,e=>{
  if(e.target.tagName!=='AUDIO'||!e.target.closest('.voice-message')){return;}
  if(event==='error'){e.target.dataset.voiceError='Could not play audio. Tap play to retry.';}
  syncVoicePlayer(e.target);
 },true);}
 app.addEventListener('click',async e=>{
  const control=e.target.closest('[data-voice-toggle],[data-voice-speed]');if(!control){return;}
  const audio=control.closest('.voice-message').querySelector('audio');
  if(control.hasAttribute('data-voice-speed')){audio.playbackRate=audio.playbackRate===1?1.5:audio.playbackRate===1.5?2:1;syncVoicePlayer(audio);return;}
  if(!audio.paused){audio.pause();return;}
  delete audio.dataset.voiceError;
  try{if(audio.error){audio.load();}await audio.play();}catch(error){if(error.name!=='AbortError'){audio.dataset.voiceError='Could not play audio. Tap play to retry.';}}
  syncVoicePlayer(audio);
 });
 app.addEventListener('input',e=>{if(!e.target.matches('.voice-seek')){return;}const audio=e.target.closest('.voice-message').querySelector('audio');if(Number.isFinite(audio.duration)&&audio.duration>0){audio.currentTime=Number(e.target.value)/100*audio.duration;syncVoicePlayer(audio);}});

 function voiceTime(seconds){const n=Math.floor(Math.max(0,Number(seconds)||0));return Math.floor(n/60)+':'+String(n%60).padStart(2,'0');}
 function voiceComposer(){
  const recording=voice.phase==='recording',preview=voice.phase==='preview',uploading=voice.phase==='uploading';
  return `<div class="composer-wrap"><div class="composer voice-composer" aria-label="Voice recording"><div class="voice-row"><span class="voice-indicator ${recording?'recording':''}">${icon('mic')}</span><strong id="voice-status" role="status">${recording?'Recording':preview?'Review voice message':uploading?'Sending voice message':voice.phase==='starting'?'Starting microphone?':'Preparing preview?'}</strong><time id="voice-time">${voiceTime(voice.duration)}</time>${button('voiceDiscard','Discard recording','close','icon-button',busy||uploading?'disabled':'')}</div>${preview&&voiceUrl?`<audio class="voice-preview" controls preload="metadata" src="${esc(voiceUrl)}" data-audio-key="voice-preview" aria-label="Preview your voice recording"></audio>`:''}${recording?'<div class="voice-meter"><progress id="voice-level" max="1" value="0" aria-label="Microphone audio level"></progress><span>60s max ? stays local until sent</span></div>':''}${uploading?`<progress class="voice-upload" id="voice-upload" max="100" value="${voice.progress||0}" aria-label="Voice upload progress"></progress>`:''}${voice.error?`<p class="voice-error" role="status">${esc(voice.error)}</p>`:''}<div class="voice-footer"><span>${preview?'Listen before sharing. Your text draft is kept.':uploading?'Keep this view open while sending.':'Your recording stays in this conversation.'}</span>${recording?button('voiceStop','Stop','check','secondary',busy?'disabled':''):preview?button('sendVoice','Send voice','send','primary',busy?'disabled':''):''}</div></div></div>`;
 }
 function clearVoice(){voice=null;if(voiceUrl){URL.revokeObjectURL(voiceUrl);voiceUrl=null;}}
 function updateVoice(data){
  const previous=voice;
  if(data.state&&data.state.roomId!==state.active){return;}
  if(!data.state){clearVoice();if(data.error){notify(data.error);}render();return;}
  voice=data.state;
  if(data.audioBase64){
   if(voiceUrl){URL.revokeObjectURL(voiceUrl);}
   const bytes=Uint8Array.from(atob(data.audioBase64),c=>c.charCodeAt(0));
   voiceUrl=URL.createObjectURL(new Blob([bytes],{type:'audio/wav'}));
  }
  if(previous?.id!==voice.id||previous?.phase!==voice.phase||previous?.error!==voice.error||data.audioBase64){render();}
  const time=document.getElementById('voice-time');if(time){time.textContent=voiceTime(voice.duration);}
  const meter=document.getElementById('voice-level');if(meter){meter.value=voice.level||0;}
  const upload=document.getElementById('voice-upload');if(upload){upload.value=voice.progress||0;}
 }
 app.addEventListener('play',event=>{if(event.target.tagName==='AUDIO'){for(const audio of app.querySelectorAll('audio')){if(audio!==event.target&&!audio.paused){audio.pause();}}}},true);
 function resizeComposer(){const el=document.getElementById('compose');if(!el){return;}const max=parseFloat(getComputedStyle(el).maxHeight)||144;el.style.height='auto';el.style.height=Math.min(Math.max(el.scrollHeight,24),max)+'px';el.style.overflowY=el.scrollHeight>max?'auto':'hidden';}
 function composer(){if(voice){return agentPanel()+voiceComposer();}return `${agentPanel()}<div class="composer-wrap">${agentSourceId?`<div class="attachment"><span>Agent: about ${esc(source(agentSourceId)?.author||'selected')} message</span>${button('clearAgentSource','Clear Agent reference','close','icon-button')}</div>`:''}${replyTo?`<div class="attachment">${icon('reply')}<span>Replying to ${esc(source(replyTo)?.author||'message')}</span>${button('cancelReply','Cancel reply','close','icon-button')}</div>`:''}${attachment?`<div class="attachment">${icon('code')}<span>${esc(attachment.path)}:${attachment.line} <code>${esc(attachment.branch)}</code></span>${button('detach','Remove code','close','icon-button')}</div>`:''}<form id="message-form" class="composer"><div class="composer-input"><textarea id="compose" rows="1" maxlength="12000" placeholder="${threadId?'Reply to discussion…':'Message your team…'}" aria-label="${threadId?'Reply to discussion':'Message room'}" aria-describedby="compose-help" ${busy?'disabled':''}>${esc(draft)}</textarea><button type="submit" class="primary send" aria-label="${busy?'Sending message':'Send message'}" title="Send message (Enter)" ${busy||(!draft.trim()&&!attachment)?'disabled':''}>${icon(busy?'more':'send')}</button></div><div class="composer-tools">${agentContextButton()}${button('attach','Attach selected code','code','icon-button',busy?'disabled':'')}${button('mentions','Mention a teammate',null,'mention-button',busy?'disabled':'')}${button('agent','Ask AI','spark','ai-button',busy?'disabled':'')}${button('voiceStart',state.voiceUnavailable||'Record voice message','mic','icon-button',busy||!state.voiceSupported||!state.connected?'disabled':'')}<span id="compose-help" class="composer-shortcut"><kbd>Enter</kbd> send / <kbd>Shift + Enter</kbd> new line</span></div></form></div>`;}
 function chat(){const r=room();let previous='';const messages=r.messages.filter(m=>!m.discussionId).map(m=>{const date=new Date(m.createdAt),day=date.toLocaleDateString(),today=new Date().toLocaleDateString();const separator=day!==previous?`<div class="day"><span>${esc(day===today?'Today':date.toLocaleDateString([],{month:'short',day:'numeric',year:'numeric'}))}</span></div>`:'';previous=day;return separator+message(m,r);}).join('');return `<main class="messages" id="messages" aria-label="Team conversation">${r.hasMore?button('loadOlder',busy?'Loading…':'Load earlier messages','refresh','history-button',busy?'disabled':''):''}${messages||`<div class="empty chat-empty"><h2>No messages yet</h2><p>Send the first message to this room.</p></div>`}</main>${composer()}`;}
 function discussions(){const r=room(),all=r.discussions||[],items=all.filter(d=>discussionFilter==='all'||d.status===discussionFilter);return `<main class="section discussions-view"><div class="section-heading"><div><h1>Discussions</h1></div><span class="count">${all.length}</span></div><p class="lead">Give each question a place to get solved.</p><div class="filter-tabs" aria-label="Filter discussions">${['open','resolved','all'].map(f=>`<button data-filter="${f}" aria-pressed="${discussionFilter===f}" class="${discussionFilter===f?'selected':''}">${f[0].toUpperCase()+f.slice(1)} <span>${all.filter(d=>f==='all'||d.status===f).length}</span></button>`).join('')}</div><div class="discussion-list">${items.map(d=>`<button class="discussion-item" data-action="openThread" data-id="${esc(d.id)}"><span class="discussion-symbol ${d.status==='resolved'?'resolved':''}">${icon(d.status==='resolved'?'check':'chat')}</span><span class="discussion-copy"><strong>${esc(d.title)}</strong><span>${esc(d.source.author)} · ${r.messages.filter(m=>m.discussionId===d.id).length} ${r.messages.filter(m=>m.discussionId===d.id).length===1?'reply':'replies'}${d.source.attachment?' · '+esc(d.source.attachment.path):''}</span></span>${icon('chevron')}</button>`).join('')||`<div class="empty"><span class="empty-icon">${icon('chat')}</span><h2>${discussionFilter==='resolved'?'Nothing resolved yet':discussionFilter==='all'?'No discussions yet':'All caught up'}</h2><p>Open a message’s more actions and choose<br>“Open discussion” to give it a focused space.</p>${button('openChat','Go to chat','arrow','secondary')}</div>`}</div></main>`;}
 function workspaceIdentity(authenticated){
  if(!authenticated){return `<span class="brand-mark">${icon('code')}</span><strong>CodeJam</strong>`;}
  const name=state.repo?.name;
  const label=name?.toLowerCase()==='codejam'?'CodeJam':name||'Open a project';
  return `<button type="button" class="project-switch" data-action="repository" title="View repository details" aria-label="${esc(label)} project details">${icon('folder')}<span>${esc(label)}</span>${icon('chevron')}</button>`;
 }
 function workspaceHeader(authenticated,r){const activeTab=tab==='chat'&&threadId?'discussions':tab;return `<header class="workspace-header"><div class="brand">${workspaceIdentity(authenticated)}<span class="status ${state.connected?'green':''}" role="status" aria-label="${state.connected?'Connected':'Connecting'}" title="${esc(state.connected?'Connected to Nexconn':state.connection||'Connecting')}"><i></i></span>${authenticated&&r?button('openCall',r.call?.participants?.length?'Join huddle':'Huddle','headphones','huddle-button',busy?'disabled':''):''}${authenticated?`<button type="button" data-tab="connect" class="icon-button ${tab==='connect'?'selected':''}" aria-label="Room setup" title="Create or join a room">${icon('settings')}</button>`:''}${button(authenticated?'account':'settings',authenticated?'Your account':'Settings',authenticated?'user':'settings','icon-button')}</div>${authenticated&&r?`<div class="room-context"><button type="button" class="room-selector" title="Switch room" data-action="rooms" aria-label="Switch room, current room: ${esc(r.name)}" aria-expanded="${showRooms}" aria-controls="room-menu"><span class="room-symbol">${icon('hash')}</span><span class="room-title"><strong>${esc(r.name)}</strong><span>${r.members.length} ${r.members.length===1?'member':'members'}</span></span><span class="room-switch-hint">Switch room</span>${icon('chevron')}</button>${showRooms?`<div id="room-menu" class="room-menu"><span class="eyebrow">SWITCH ROOM</span>${state.rooms.map(x=>`<button class="room-option ${x.id===state.active?'current':''}" data-action="switchRoom" data-id="${esc(x.id)}" ${x.id===state.active?'aria-current="true"':''}>${icon('hash')}<span>${esc(x.name)}</span>${x.id===state.active?icon('check'):''}</button>`).join('')||'<p>No rooms yet.</p>'}${button('inviteModal','Invite teammate','user','room-option')}${button('newRoom','Create or join a room','plus','room-option new-room')}${r?button('leaveRoomConfirm','Exit room','back','room-option',busy?'disabled':''):''}${r&&isOwner(r)?button('deleteRoomConfirm','Delete room','close','room-option',busy?'disabled':''):''}</div>`:''}</div><nav aria-label="Workspace navigation">${[['chat','Chat','chat'],['discussions','Discussions','chat'],['decisions','Decisions','pin'],['team','Team','user']].map(([key,label,glyph])=>`<button type="button" data-tab="${key}" ${key==='chat'?'data-action="openChat"':''} class="${activeTab===key?'active':''}" ${activeTab===key?'aria-current="page"':''}>${icon(glyph)}<span>${label}</span>${key==='discussions'&&(r.discussions||[]).some(d=>d.status==='open')?`<span class="nav-dot" title="Open discussions"></span>`:''}${key==='decisions'&&r.pins?.length?`<span class="count">${r.pins.length}</span>`:''}</button>`).join('')}</nav>`:''}</header>`;}
 function thread(){const r=room(),d=discussion();if(!d){return `<main class="section">${button('backChat','Back to chat','back','text-button')}<p>Loading this discussion…</p></main>`;}const replies=r.messages.filter(m=>m.discussionId===d.id||m.replyTo===d.source.id);return `<div class="thread-titlebar">${button('backDiscussions','All discussions','back','text-button')}<span class="eyebrow ${state.connected?'green':''}">${state.connected?'● LIVE':'RECONNECTING'}</span>${button('agent','Ask AI','spark','icon-button')}</div><main class="messages thread-view" id="messages"><div class="thread-meta"><span>${icon('branch')} ${esc(d.source.attachment?.branch||state.repo?.branch||'project')}</span><code>THREAD #${esc(d.id.slice(0,6))}</code></div><div class="thread-heading"><h1>${esc(d.title)}</h1><span class="state-label ${d.status}">${d.status==='resolved'?'✓ RESOLVED':'● OPEN'}</span></div><div class="thread-author"><span>${esc(d.source.author)} · ${esc(new Date(d.createdAt).toLocaleDateString())}</span><div class="thread-tools">${button('pin','Pin root decision','pin','icon-button',meta(d.source))}${d.source.attachment?button('openFile','Open code','open','icon-button',meta(d.source)):''}${button('resolveDiscussion',d.status==='open'?'Resolve discussion':'Reopen discussion','check','icon-button',`data-id="${esc(d.id)}" data-status="${d.status==='open'?'resolved':'open'}"`)}</div></div>${d.source.attachment?codeCard(d.source.attachment,d.source.id,true):''}${threadDecisions(r,d)}<div class="day"><span>DISCUSSION (${replies.length+1})</span></div>${message(d.source,r,true)}${replies.map(m=>message(m,r,true)).join('')}${d.status==='resolved'?`<div class="resolved-note">${icon('check')} Resolved${d.resolvedBy?' by '+esc(d.resolvedBy):''}. You can still add context or reopen.</div>`:''}</main>${composer()}`;}
 const decisionStates={proposed:'Proposed',accepted:'Accepted',superseded:'Superseded'};
 const linkKinds={pr:'Pull request',issue:'Issue',commit:'Commit'};
 const decisionStatus=pin=>pin.status||'accepted';

 function decisionBadge(pin){
  const status=decisionStatus(pin);
  return `<span class="decision-status ${esc(status)}">${esc(decisionStates[status])}</span>`;
 }
 function messageDecisions(room,messageId){
  return (room.pins||[]).filter(pin=>pin.source.id===messageId)
   .map(pin=>button('openDecision',decisionStates[decisionStatus(pin)]+' · '+pin.title,'pin','thread-link message-decision',`data-id="${esc(pin.id)}"`)).join('');
 }
 function threadDecisions(room,discussion){
  const pins=(room.pins||[]).filter(pin=>pin.discussionId===discussion.id||pin.source.id===discussion.source.id);
  return `<section class="thread-decisions">
   <div class="section-heading"><h3>Decisions</h3>${button('newProposal','Propose decision','plus','text-button',`data-id="${esc(discussion.id)}"`)}</div>
   ${pins.map(pin=>`<button type="button" class="thread-decision" data-action="openDecision" data-id="${esc(pin.id)}">${decisionBadge(pin)}<span class="thread-decision-body"><strong>${esc(pin.title)}</strong>${decisionSummary(pin)?`<small>${esc(pin.text)}</small>`: ''}</span>${icon('chevron')}</button>`).join('')}
  </section>`;
 }
 function decisionSummary(pin){
  const text=pin.text.trim();
  return text===pin.title.trim()?'':text;
 }
 function decisionHistory(pin,room){
  const relation=(label,id)=>{
   const related=room.pins.find(other=>other.id===id);
   return `<div class="decision-relation"><span>${label}</span>${related?button('openDecision',related.title,'arrow','text-button',`data-id="${esc(id)}"`):'<span>Decision unavailable</span>'}</div>`;
  };
  return (pin.replacedById?relation('Replaced by',pin.replacedById):'')+(pin.replacesIds||[]).map(id=>relation('Replaces',id)).join('');
 }
 function implementationLinks(pin){
  const links=(pin.implementationLinks||[]).map(link=>{
   if(!Object.hasOwn(linkKinds,link.kind)||!URL.canParse(link.url)){return '';}
   const url=new URL(link.url);
   if(url.protocol!=='https:'||url.username||url.password){return '';}
   const href=esc(url.href);
   return `<li><a href="${href}" target="_blank" rel="noopener noreferrer" title="${href}">
     <strong>${linkKinds[link.kind]}</strong><span>${esc(url.host+url.pathname+url.search+url.hash)}</span>${icon('open')}
    </a>${button('removeImplementation','Remove '+linkKinds[link.kind]+' link','close','icon-button',`data-id="${esc(pin.id)}" data-url="${href}" ${busy?'disabled':''}`)}</li>`;
  }).join('');
  return `<section class="implementation"><div class="section-heading"><h3>Implementation</h3>
   ${button('linkImplementation','Add link','plus','text-button',`data-id="${esc(pin.id)}"`)}</div>
   ${links?`<ul>${links}</ul>`:''}</section>`;
 }
 function decisionDetails(pin,room){
  const summary=decisionSummary(pin);
  const source=pin.source;
  const discussion=room.discussions?.find(item=>item.id===pin.discussionId);
  const origin=discussion?.title||(pin.discussionId?'Discussion':'Room chat');
  const excerpt=source.text?.trim();
  const quote=excerpt?`<blockquote>${format(excerpt)}</blockquote>`:'';
  const repeat=excerpt===pin.title.trim()||excerpt===summary;
  return `${decisionBadge(pin)}${decisionHistory(pin,room)}${summary?`<p class="decision-detail-text">${format(summary)}</p>`:''}
   ${pin.originalProposal?`<details class="original-proposal"><summary>Original proposal</summary><strong>${esc(pin.originalProposal.title)}</strong><p>${format(pin.originalProposal.text)}</p></details>`:''}
   <section class="decision-source">
    <h3>Original message</h3>
    <p>${esc(room.name)} · ${esc(origin)}</p>
    <p>${esc(source.author)} · ${esc(new Date(source.createdAt).toLocaleString())}</p>
    ${quote&&repeat?`<details><summary>Show message text</summary>${quote}</details>`:quote}
    ${source.attachment?codeCard(source.attachment,source.id,true):''}
   </section>
   ${implementationLinks(pin)}
   <p class="small-note">${pin.proposedAt?'Proposed':'Recorded'} by ${esc(pin.pinnedBy)} · ${esc(new Date(pin.createdAt).toLocaleString())}
   ${pin.acceptedAt?`<br>Accepted by ${esc(pin.acceptedBy)} · ${esc(new Date(pin.acceptedAt).toLocaleString())}`:''}
   ${pin.supersededAt?`<br>Replaced by ${esc(pin.supersededBy)} · ${esc(new Date(pin.supersededAt).toLocaleString())}`:''}</p>
   <div class="modal-actions">
    ${pin.discussionId?button('openThread','Open discussion','chat','secondary',`data-id="${esc(pin.discussionId)}"`):''}
    ${decisionStatus(pin)==='accepted'?button('replaceDecision','Replace decision',null,'secondary',`data-id="${esc(pin.id)}"`):''}
    ${pin.status==='proposed'?button('reviewProposal','Review proposal','check','primary',`data-id="${esc(pin.id)}"`):''}
   </div>`;
 }
 function decisions(){
  const r=room(), all=r.pins||[], query=search.trim().toLowerCase();
  const pins=all.filter(pin=>(decisionFilter==='all'||decisionStatus(pin)===decisionFilter)
   &&[pin.title,pin.text,pin.source.attachment?.path].join(' ').toLowerCase().includes(query))
   .sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  return `<main class="section decisions-view">
   <div class="section-heading"><h1>Decisions</h1>${button('newProposal','New proposal','plus','secondary')}</div>
   <div class="decision-filters"><div class="search-field">${icon('search')}<input id="decision-search" value="${esc(search)}" placeholder="Search decisions or file paths" aria-label="Search decisions"></div>
    <select id="decision-filter" aria-label="Filter decisions by status">${options({all:'All statuses',...decisionStates},decisionFilter)}</select></div>
   ${pins.map(pin=>`<article class="decision-card"><div class="decision-card-heading"><h2>${esc(pin.title)}</h2>${decisionBadge(pin)}</div>
    ${decisionSummary(pin)?`<p>${format(pin.text)}</p>`:''}
    ${pin.replacedById?decisionHistory({...pin,replacesIds:[]},r):''}
    ${pin.source.attachment?`<div class="decision-reference">${icon('code')} ${esc(pin.source.attachment.path)}:${pin.source.attachment.line}</div>`:''}
    <div class="decision-footer"><span>${pin.proposedAt?'Proposed':'Recorded'} by ${esc(pin.pinnedBy)} · ${esc(new Date(pin.createdAt).toLocaleDateString())}</span>
     <div>${button('openDecision','View details','arrow','text-button',`data-id="${esc(pin.id)}"`)}
     ${!pin.replacedById&&!pin.replacesIds?.length?button('unpinConfirm','Unpin','close','text-button',`data-id="${esc(pin.id)}"`):''}</div></div>
   </article>`).join('')||`<div class="empty"><h2>${all.length?'No matching decisions':'No decisions yet'}</h2><p>${all.length?'Change the search or status filter.':'Propose a decision from a discussion or pin an agreement from chat.'}</p></div>`}
  </main>`;
 }
 function options(choices,selected){
  return Object.entries(choices).map(([value,label])=>`<option value="${esc(value)}" ${value===selected?'selected':''}>${esc(label)}</option>`).join('');
 }
 function decisionEditor(room){
  const {change}=modal;
  let fields='',submit='';
  if(change.action==='addLink'){
   fields=`<label for="link-kind">Link type</label><select id="link-kind" data-decision-field="kind">${options(linkKinds,change.kind)}</select>
    <label for="implementation-url">URL</label><input id="implementation-url" data-decision-field="url" type="url" required maxlength="2048" value="${esc(change.url)}" placeholder="https://…" autocomplete="off">`;
   submit='Add link';
  }else{
   if(change.action==='propose'){
    if(!room.discussions?.length){
     return `<p>Open a chat message’s actions and choose <strong>Open discussion</strong> to start the conversation for this proposal.</p><div class="modal-actions"><button type="button" class="primary" data-tab="chat">Go to chat</button></div>`;
    }
    fields=`<label for="proposal-discussion">Source discussion</label><select id="proposal-discussion" data-decision-field="discussionId" required>
     <option value="">Choose a discussion</option>${options(Object.fromEntries(room.discussions.map(d=>[d.id,d.title])),change.discussionId)}</select>`;
    submit='Create proposal';
   }else if(change.action==='replace'){
    const choices=(room.pins||[]).filter(pin=>pin.id!==change.id&&decisionStatus(pin)==='accepted');
    fields=`<p>The original decision will remain in the history as Superseded.</p>
     <label for="replacement">Replacement decision</label><select id="replacement" data-decision-field="replacementId">
      ${options({'':'Write a new decision',...Object.fromEntries(choices.map(pin=>[pin.id,pin.title]))},change.replacementId)}</select>`;
    submit='Replace decision';
   }else{submit='Accept decision';}
   if(!change.replacementId){
    fields+=`<label for="decision-title">${change.action==='propose'?'Proposed choice':'Decision'}</label>
     <input id="decision-title" data-decision-field="title" required maxlength="100" value="${esc(change.title)}">
     <label for="decision-reason">Rationale${change.action==='propose'?' (optional)':''}</label>
     <textarea id="decision-reason" class="draft-text" data-decision-field="text" maxlength="12000" ${change.action==='propose'?'':'required'}>${esc(change.text)}</textarea>`;
   }
  }
  return `<form id="decision-form">${fields}<div class="modal-actions">${button('cancelDecisionEdit','Cancel',null,'secondary',busy?'disabled':'')}
   <button type="submit" class="primary" ${busy?'disabled':''}>${submit}</button></div></form>`;
 }
 function team(){const r=room(),online=r.presence||[],people=r.call?.participants||[],mine=people.find(p=>p.id===state.userId);return `<main class="section team-view"><div class="section-heading"><div><h1>Team</h1></div>${button('inviteModal','Invite teammate','plus','secondary')}</div><section class="huddle-card"><div class="huddle-top"><span class="status-dot"></span><strong>${people.length?'Project huddle':'Start a conversation'}</strong><span class="tag">${people.length?people.length+' IN CALL':'AUDIO'}</span></div><div class="call-context">${icon('chat')} ${esc(r.discussions?.find(d=>d.status==='open')?.title||r.name)}<span>Audio room</span></div>${people.length?`<div class="call-roster">${people.map((m,i)=>`<div class="call-person"><span class="call-avatar color-${i%3}">${esc(initials(m.name))}</span><strong>${esc(m.name)} ${m.id===state.userId?'<small>YOU</small>':''}</strong><span>${m.muted?'Mic muted':m.status==='connected'?'In call':m.status==='ready'?'Ready when you are':'Connecting…'}</span><div class="sound-bars">${m.status==='connected'&&!m.muted?'● In call':'· · ·'}</div></div>`).join('')}</div>`:''}<div class="call-output"><span>${icon('headphones')} Audio opens in your browser</span><span class="green">${people.length?'● Active':'Ready'}</span></div><div class="huddle-controls">${mine?`${button('callMute',mine.muted?'Unmute':'Mute','mic','secondary')}${button('openCall','Open controls','open','secondary')}${button('callLeave','Leave',null,'danger-button')}`:button('openCall',people.length?'Join huddle':'Start audio huddle','headphones','primary full',busy?'disabled':'')}</div></section><div class="roster-heading"><span class="eyebrow">TEAMMATES (${online.length} ONLINE)</span><span class="muted">${r.members.length} ${r.members.length===1?'member':'members'}</span></div><div class="team-roster">${r.members.map((m,i)=>{const p=online.find(x=>x.id===m.id),c=people.find(x=>x.id===m.id);return `<article class="roster-member"><div class="avatar-wrap"><span class="avatar color-${i%3}">${esc(initials(m.name))}</span><i class="${p?'online':''}"></i></div><div><strong>${esc(m.name)} ${m.id===state.userId?'<small>YOU</small>':''} ${m.id===(r.ownerId||r.members[0]?.id)?'<small>OWNER</small>':''}</strong><p>${p?esc(p.focus):'Offline · not currently in this room'}</p></div><span class="member-status ${c?'green':''}">${c?'◖ In call':p?'● Online':'Offline'}</span>${isOwner(r)&&m.id!==state.userId?button('removeMemberConfirm','Remove member','close','icon-button',`data-id="${esc(m.id)}" ${busy?'disabled':''}`):''}</article>`;}).join('')}</div><div class="room-management">${button('leaveRoomConfirm','Exit room','back','secondary',busy?'disabled':'')}${isOwner(r)?button('deleteRoomConfirm','Delete room','close','danger-button',busy?'disabled':''):''}</div></main>`;}
 function miniCall(){const me=room()?.call?.participants?.find(p=>p.id===state.userId);return me&&tab!=='team'?`<div class="global-call"><span class="status-dot"></span>${icon('headphones')}<strong>In project huddle</strong><span>${me.muted?'Muted':'Mic on'}</span>${button('team','Call controls','open','icon-button')}${button('callLeave','Leave call','close','icon-button')}</div>`:'';}
 const agentLabels={code:'Selected code',messages:'Recent messages',diff:'Git diff'};
 function resetAgent(){if(agentRequest){host.postMessage({type:'cancelAgent'});}agentRequest=null;agentResult=null;agentSourceId=null;}
 function scopeKey(){return JSON.stringify([state.userId||'',state.active||'',state.repo?.root||'']);}
 function rememberPermissions(){aiGrants[agentScope]={...aiOptions};const keys=Object.keys(aiGrants);if(keys.length>20){delete aiGrants[keys[0]];}save();}
 function agentContextButton(){
  const count=Object.values(aiOptions).filter(Boolean).length;
  return button('agentContext','Agent context'+(count?' ('+count+' enabled)':''),'shield','icon-button agent-context-trigger'+(showAgentContext?' is-open':'')+(count?' has-context':''),'aria-haspopup="dialog" aria-expanded="'+showAgentContext+'" aria-controls="agent-context-popover"');
 }
 function agentControls(){
  const details={code:['code','Attached excerpt or current editor selection'],messages:['chat','Recent messages in this room or discussion'],diff:['diff','Staged and unstaged changes in your checkout']};
  return '<section id="agent-context-popover" class="agent-context-popover" role="dialog" aria-modal="false" aria-labelledby="agent-context-title"><div class="agent-context-head"><h2 id="agent-context-title">Agent context</h2>'+button('closeAgentContext','Close context options','close','icon-button')+'</div><p class="agent-context-intro">Choose what Agent can use.</p><div class="agent-context-options">'+Object.entries(agentLabels).map(([key,label])=>'<label class="agent-context-option" for="ai-'+key+'"><span class="agent-context-icon">'+icon(details[key][0])+'</span><span class="agent-context-copy"><strong>'+label+'</strong><small>'+details[key][1]+'</small></span><input type="checkbox" id="ai-'+key+'" '+(aiOptions[key]?'checked':'')+'></label>').join('')+'</div><p class="agent-context-note">Applies to @agent. Answers stay private until shared.</p></section>';
 }
 function positionAgentContext(){
  const popup=document.getElementById('agent-context-popover'),trigger=app.querySelector('[data-action="agentContext"]');if(!popup||!trigger){return;}
  const rect=trigger.getBoundingClientRect();popup.style.maxHeight=Math.max(0,window.innerHeight-24)+'px';
  popup.style.left=Math.max(12,Math.min(rect.left,window.innerWidth-popup.offsetWidth-12))+'px';
  popup.style.top=Math.max(12,Math.min(rect.top-popup.offsetHeight-8,window.innerHeight-popup.offsetHeight-12))+'px';
 }
 function closeAgentContext(restore=false){
  showAgentContext=false;document.getElementById('agent-context-popover')?.remove();
  const trigger=app.querySelector('[data-action="agentContext"]');trigger?.setAttribute('aria-expanded','false');trigger?.classList.remove('is-open');
  if(restore){trigger?.focus({preventScroll:true});}
 }

 function agentMarkup(text){return text.split(/(```[\s\S]*?```)/g).map(part=>part.startsWith('```')?'<pre><code>'+esc(part.replace(/^```[^\n]*\n?/,'').replace(/```$/,''))+'</code></pre>':'<div class="agent-prose">'+format(part)+'</div>').join('');}
 function agentPanel(){
  if(!agentRequest&&!agentResult){return '';}
  const pending=!!agentRequest,r=agentResult;
  const title=pending?'Agent is thinking':r.status==='answer'?r.shared?'Agent answer shared':'Agent answer - only you':'Agent needs your attention - only you';
  return '<section class="agent-panel '+(!pending&&r.status!=='answer'?'agent-error':'')+'" aria-label="Private Agent response" role="status"><div class="agent-panel-head"><strong>'+icon('spark')+' '+title+'</strong>'+button(pending?'cancelAgent':'dismissAgent',pending?'Cancel request':'Dismiss','close','icon-button')+'</div>'+(pending?'<p>Reading only the context you enabled. You can keep writing.</p>':'<p class="agent-question">'+esc(r.question)+'</p>'+(r.shared?'':agentMarkup(r.text))+(r.shareError?'<p class="agent-share-error">'+esc(r.shareError)+'</p>':'')+'<div class="agent-panel-actions">'+(r.status==='answer'&&!r.shared?button('shareAgent','Share with room','send','primary',busy?'disabled':''):r.status!=='answer'?button('retryAgent','Retry question','refresh','secondary',busy?'disabled':''):'')+'</div>')+'</section>';
 }
 function runAgent(question){
  if(agentRequest||voice){return;}
  const instruction=String(question??draft.trim().replace(/^@agent(?:\s+|$)/i,'')).trim();
  if(!instruction||instruction.length>2000){agentResult={status:'error',question:instruction,text:'Enter a question after @agent (up to 2,000 characters).'};render();return;}
  showAgentContext=false;const operation=crypto.randomUUID();agentResult=null;
  agentRequest={operation,question:instruction,draft:draft.trim().replace(/^@agent(?:\s+|$)/i,'')===instruction?draft:null,attachment,scope:scopeKey(),threadId};
  const data={type:'askAgent',operation,roomId:state.active,instruction,permissions:{...aiOptions},attachment:agentSourceId?null:attachment,sourceId:agentSourceId||replyTo||discussion()?.source.id,discussionId:threadId};
  render();host.postMessage(data);
 }
 function renderModal(){if(!modal){return '';}const r=room();let title='',content='';
  if(modal.type==='repository'){title='Your project';content=repoCard()+`<div class="modal-actions">${button('chooseRepository','Open another folder','folder','secondary')}${button('close','Done',null,'primary')}</div>`;}
  if(modal.type==='messageMenu'){const m=source(modal.id);title='Message actions';content=`<div class="message-preview"><strong>${esc(m?.author)}</strong><p>${esc(m?.text?.slice(0,180)||m?.attachment?.path||'Shared code')}</p></div><div class="action-list">${button('reply','Reply','reply','action-option',`data-id="${esc(modal.id)}"`)}${button('discuss','Open discussion','chat','action-option',`data-id="${esc(modal.id)}"`)}${button('pin','Save a decision','pin','action-option',`data-id="${esc(modal.id)}"`)}${button('agent','Ask AI about this','spark','action-option',`data-id="${esc(modal.id)}"`)}${button('translateMenu','Translate','chat','action-option',`data-id="${esc(modal.id)}" ${m?.text?.trim()?'':'disabled'}`)}</div>`;}
  if(modal.type==='discussion'){title='Start a discussion';content=`<p>Give this blocker a name your teammates can find later.</p><label for="discussion-title">Discussion title</label><input id="discussion-title" maxlength="120" value="${esc(modal.title)}"><div class="modal-actions">${button('close','Cancel',null,'secondary')}${button('createDiscussion','Create discussion','chat','primary',busy?'disabled':'')}</div>`;}
  if(modal.type==='pin'){title='Pin a decision';content=`<p>Give the decision a title that states what the team agreed to. The original message is saved with it.</p><label for="pin-title">Decision title</label><input id="pin-title" maxlength="100" value="${esc(modal.title)}"><label for="pin-text">Reason or follow-up</label><textarea id="pin-text" class="draft-text" placeholder="Why did the team choose this? What happens next?">${esc(modal.text)}</textarea><div class="modal-actions">${button('close','Cancel',null,'secondary')}${button('savePin','Save decision','pin','primary',busy?'disabled':'')}</div>`;}
  if(modal.type==='react'){title='Add a reaction';content=`<div class="reaction-picker">${Object.entries(symbols).map(([name,symbol])=>`<button data-action="reaction" data-id="${esc(modal.id)}" data-emoji="${name}" aria-label="${name}">${symbol}</button>`).join('')}</div>`;}
  if(modal.type==='mentions'){title='Mention a teammate';content=`<p>Select a teammate to mention.</p>${r.members.filter(m=>m.id!==state.userId).map(m=>`<button class="mention-choice" data-action="mentionUser" data-id="${esc(m.id)}"><span class="avatar color-1">${esc(initials(m.name))}</span>${esc(m.name)}<span class="muted">@${esc(m.name.replace(/\s+/g,'_'))}</span></button>`).join('')||'<p>Invite a teammate to mention them here.</p>'}`;}
  if(modal.type==='invite'){title='Better with your team';content=`<p>Share this code with a teammate. They can open Room setup → Join with invite.</p><div class="invite"><code>${esc(r.invite)}</code>${button('copyInvite','Copy code','copy','secondary')}</div><p class="small-note">${r.inviteExpiresAt?'Expires '+esc(new Date(r.inviteExpiresAt).toLocaleString()):'Private invitation'}</p><div class="modal-actions">${button('renewInvite','Generate a fresh invitation','refresh','secondary',busy?'disabled':'')}</div>`;}
  if(modal.type==='deleteRoom'){title='Delete this room?';content=`<p>Delete <strong>${esc(r.name)}</strong> for everyone? Its conversations and saved decisions will be removed.</p><div class="modal-actions">${button('close','Cancel',null,'secondary',busy?'disabled':'')}${button('deleteRoom','Delete room',null,'danger-button',busy?'disabled':'')}</div>`;}
  if(modal.type==='leaveRoom'){const successor=r.members.find(m=>m.id!==state.userId);title='Exit this room?';content=`<p>You will leave <strong>${esc(r.name)}</strong>. ${isOwner(r)?successor?`${esc(successor.name)} will become the room owner.`:'You are the last member, so the room will be deleted.':'Ask a teammate for a new invitation if you want to rejoin.'}</p><div class="modal-actions">${button('close','Stay in room',null,'secondary',busy?'disabled':'')}${button('leaveRoom','Exit room',null,'danger-button',busy?'disabled':'')}</div>`;}
  if(modal.type==='removeMember'){const member=r.members.find(m=>m.id===modal.id);title='Remove this member?';content=`<p>Remove <strong>${esc(member?.name)}</strong> from ${esc(r.name)}? The invitation code will also change.</p><div class="modal-actions">${button('close','Cancel',null,'secondary',busy?'disabled':'')}${button('removeMember','Remove member',null,'danger-button',busy?'disabled':'')}</div>`;}
  if(modal.type==='translate'){const message=source(modal.id);title='Translate message';content='<p class="language-note">Only you will see the translation. The original stays in the conversation.</p><label for="translation-language">Translate to</label>'+languageSelect('translation-language',modal.language)+'<div class="message-preview"><strong>Original</strong><p>'+esc(message?.text?.slice(0,400)||'')+'</p></div>'+(modal.error?'<p class="translation-error" role="alert">'+esc(modal.error)+'</p>':'')+'<div class="modal-actions">'+button('close','Cancel',null,'secondary',busy?'disabled':'')+button('translateMessage',busy?'Translating...':'Translate','chat','primary',busy||!message?.text?.trim()?'disabled':'')+'</div>';}
  if(modal.type==='account'){title='Your CodeJam account';content=`<div class="account-card"><span class="avatar color-0">${esc(initials(state.displayName))}</span><div><strong>${esc(state.displayName)}</strong><p>${esc(state.user?.email||'Legacy development identity')}</p></div></div><p>${state.user?.isGuest?'Sign in or create an account to keep your rooms together.':'Your rooms and decisions follow this account.'}</p><label for="account-language">Default translation language</label>${languageSelect('account-language',accountLanguage)}<div class="modal-actions">${button('setLanguage','Save language',null,'secondary',busy?'disabled':'')}${state.user?.isGuest?button('linkAccount','Link an account','user','primary'):''}${button('signOut','Sign out',null,'secondary',busy?'disabled':'')}</div>`;}
  if(modal.type==='decision'){const p=r?.pins?.find(p=>p.id===modal.id);title=p?.title||'Decision';content=p?decisionDetails(p,r):'<p>This decision is no longer available.</p>';}
  if(modal.type==='decisionEdit'){title=modal.heading;content=decisionEditor(r);}
  if(modal.type==='unpin'){title='Remove this saved decision?';content=`<p>The original conversation will remain in chat.</p><div class="modal-actions">${button('close','Keep decision',null,'secondary')}${button('unpin','Remove pin',null,'primary',`data-id="${esc(modal.id)}"`)}</div>`;}
  return `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-head"><span class="blue">${icon(modal.type==='agent'||modal.type==='review'?'spark':modal.type==='pin'?'pin':'chat')}</span><h2 id="modal-title">${esc(title)}</h2>${button('close','Close dialog','close','icon-button modal-close',busy?'disabled':'')}</div>${content}</section></div>`;
 }
 function focusMatches(token){return [...app.querySelectorAll('button')].filter(b=>b.dataset.action===token.action&&b.dataset.id===token.item&&b.dataset.tab===token.tab&&b.dataset.filter===token.filter&&b.dataset.auth===token.auth&&b.dataset.connect===token.connect&&!!b.closest('.modal')===token.inModal);}
 function focusToken(el){if(!el||el===document.body){return null;}const token={id:el.id,action:el.dataset.action,item:el.dataset.id,tab:el.dataset.tab,filter:el.dataset.filter,auth:el.dataset.auth,connect:el.dataset.connect,inModal:!!el.closest('.modal')};token.index=focusMatches(token).indexOf(el);return token;}
 function restoreFocus(token){if(!token){return;}const el=token.id?document.getElementById(token.id):focusMatches(token)[Math.max(token.index,0)];if(el&&!el.disabled){el.focus({preventScroll:true});}}
 function closeModal(){modal=null;render();restoreFocus(modalOrigin);modalOrigin=null;}
 function render(){
  const playback=[...app.querySelectorAll('audio')].map(el=>({key:el.dataset.audioKey,element:el,playing:!el.paused}));
  const currentMessages=document.getElementById('messages');if(currentMessages){scrollPositions.set(currentMessages.dataset.scrollKey,currentMessages.scrollTop);}
  save();const authPassword=document.getElementById('auth-password')?.value;const focused=document.activeElement,focus=focusToken(focused),id=focused?.id,start=focused?.selectionStart,end=focused?.selectionEnd;
  const scroll=document.getElementById('messages'),nearBottom=!scroll||scroll.scrollHeight-scroll.scrollTop-scroll.clientHeight<70;
  const r=room(),authenticated=state.authenticated!==false&&!forceSignIn;if(!authenticated||!r||tab!=='chat'||voice||modal){showAgentContext=false;}if(!r&&tab!=='connect'){tab='connect';threadId=null;}
  app.innerHTML=`${workspaceHeader(authenticated,r)}${!authenticated?authScreen():`${!state.connected?`<div class="connection-error" role="status">${esc(state.connection||'Connecting…')}${button('refresh','Reconnect','refresh','text-button')}</div>`:''}${state.user?.isGuest?`<div class="legacy-banner">Keep your rooms with an account.${button('linkAccount','Sign in','user','text-button')}</div>`:''}${r&&state.linked===false&&tab!=='connect'?`<div class="link-banner">${icon('folder')} Confirm this checkout belongs to ${esc(r.repository)}.${button('linkRoom','Link checkout','link','text-button')}</div>`:''}${miniCall()}${tab==='connect'?`<main class="view">${connect()}</main>`:tab==='chat'?(threadId?thread():chat()):tab==='discussions'?discussions():tab==='decisions'?decisions():team()}`}${modal?renderModal():''}${showAgentContext?agentControls():''}`;
  if(authPassword&&document.getElementById('auth-password')){document.getElementById('auth-password').value=authPassword;}
  if(authenticated&&state.connected&&state.updatesPaused){const banner=document.createElement('div');banner.className='connection-error sync-banner';banner.role='status';banner.innerHTML=`<span>Room updates paused. Chat is still connected.</span>${button('refresh','Retry','refresh','text-button')}`;app.querySelector('.workspace-header')?.after(banner);}
  for(const el of app.children){el.inert=!!modal&&!el.classList.contains('modal-backdrop');}
  resizeComposer();positionAgentContext();
  for(const audio of app.querySelectorAll('audio')){const previous=playback.find(p=>p.key===audio.dataset.audioKey&&p.element.src===audio.src);if(previous){audio.replaceWith(previous.element);previous.reused=true;if(previous.playing&&previous.element.paused){previous.element.play().catch(()=>{});}}}
  for(const audio of app.querySelectorAll('.voice-message audio')){syncVoicePlayer(audio);}
  for(const previous of playback){if(!previous.reused&&!previous.element.paused){previous.element.pause();}}
  const nextScroll=document.getElementById('messages');if(nextScroll){const key=state.active+'/'+(threadId||'chat');nextScroll.dataset.scrollKey=key;nextScroll.scrollTop=scroll?.dataset.scrollKey===key&&nearBottom?nextScroll.scrollHeight:(scrollPositions.get(key)??nextScroll.scrollHeight);}
  if(showAgentContext){const target=document.getElementById(focus?.id);(target?.closest('#agent-context-popover')?target:document.getElementById('ai-code'))?.focus({preventScroll:true});}else{restoreFocus(focus);}
  const next=document.getElementById(id);if(next&&!next.disabled){if(typeof start==='number'&&next.setSelectionRange&&next.type!=='email'){try{next.setSelectionRange(start,end);}catch{}}}
 }
 function openModal(type,extra={}){showAgentContext=false;if(!modal){modalOrigin=focusToken(document.activeElement);}modal={type,...extra};showRooms=false;render();(document.querySelector('.modal input:not([type=checkbox]),.modal select,.modal textarea')||document.querySelector('.modal .action-option')||document.querySelector('.modal button'))?.focus();}
 function openAgent(id){
  if(voice){notify('Send or discard your recording first.');return;}
  modal=null;agentSourceId=id||null;tab='chat';
  if(!/^@agent(?:\s|$)/i.test(draft.trim())){draft='@agent '+(draft.trim()||(id?'Explain this message.':threadId?'Explain this discussion.':''));}
  render();document.getElementById('compose')?.focus();
 }
 function openThread(id){changeThread(id);tab='chat';modal=null;render();const d=discussion();if(d?.source.attachment){host.postMessage({type:'inspectReference',id:d.source.id});}}
 function send(text=draft,reviewed=false){if(busy||(!text.trim()&&!attachment)){return;}if(/^@agent(?:\s|$)/i.test(text.trim())&&!reviewed){runAgent(text.trim().replace(/^@agent(?:\s+|$)/i,''));return;}const mentions=room().members.filter(m=>m.id!==state.userId&&text.includes('@'+m.name.replace(/\s+/g,'_'))).map(m=>m.id);request('send',{roomId:state.active,text,attachment,replyTo:replyTo||(threadId?discussion()?.source.id:null),discussionId:threadId,mentions,reviewedDraft:reviewed});}
 app.addEventListener('input',e=>{const id=e.target.id;if(modal?.type==='decisionEdit'&&e.target.dataset.decisionField){modal.change[e.target.dataset.decisionField]=e.target.value;}if(id==='compose'){draft=e.target.value;retryId=null;resizeComposer();save();const b=app.querySelector('.send');if(b){b.disabled=!draft.trim()&&!attachment;}}if(id==='room-name'){roomName=e.target.value;}if(id==='invite'){invite=e.target.value;}if(id==='auth-email'){authEmail=e.target.value;}if(id==='auth-name'){authName=e.target.value;}if(id==='decision-search'){search=e.target.value;render();}if(id==='discussion-title'){modal.title=e.target.value;}if(id==='pin-title'){modal.title=e.target.value;}if(id==='pin-text'){modal.text=e.target.value;}});
 app.addEventListener('change',e=>{
  if(e.target.id==='decision-filter'){decisionFilter=e.target.value;render();return;}
  if(modal?.type==='decisionEdit'&&e.target.dataset.decisionField){
   modal.change[e.target.dataset.decisionField]=e.target.value;
   if(e.target.id==='replacement'){render();}
   return;
  }
  if(e.target.id==='account-language'){accountLanguage=e.target.value;}if(e.target.id==='translation-language'){modal.language=e.target.value;modal.error='';}
  if(['ai-code','ai-messages','ai-diff'].includes(e.target.id)){aiOptions[e.target.id.slice(3)]=e.target.checked;if(agentRequest){resetAgent();}rememberPermissions();render();}});
 app.addEventListener('submit',e=>{e.preventDefault();if(e.target.id==='decision-form'&&modal?.type==='decisionEdit'){
   const change={...modal.change};
   if(change.action==='replace'&&change.replacementId){delete change.newId;}
   request('updateDecision',{roomId:modal.roomId,change});return;
  }if(e.target.id==='message-form'){send();}if(e.target.id==='create-form'){request('createRoom',{name:roomName.trim()||state.repo?.name});}if(e.target.id==='join-form'){request('joinRoom',{invite});}if(e.target.id==='auth-form'){const password=document.getElementById('auth-password').value;request('signIn',{mode:authMode,email:authEmail,password,name:authName});}});
 app.addEventListener('keydown',e=>{if(e.key==='Escape'&&showAgentContext){e.preventDefault();e.stopPropagation();closeAgentContext(true);return;}if(e.target.id==='compose'&&e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&e.keyCode!==229){e.preventDefault();send();}if(e.key==='Escape'&&showRooms){showRooms=false;render();document.querySelector('.room-selector')?.focus();}if(e.key==='Escape'&&modal&&!busy){closeModal();return;}if(e.key==='Tab'&&modal){const items=[...app.querySelectorAll('.modal button:not([disabled]),.modal input:not([disabled]),.modal textarea:not([disabled]),.modal select:not([disabled]),.modal a[href],.modal summary')],first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}});
 app.addEventListener('click',e=>{
  if(e.target.classList.contains('modal-backdrop')&&!busy){closeModal();return;}
  const filter=e.target.closest('[data-filter]');if(filter){discussionFilter=filter.dataset.filter;render();return;}
  const t=e.target.closest('[data-tab]');if(t&&!t.disabled&&!busy){if(voice){notify('Send or discard your voice message before changing conversations.');return;}tab=t.dataset.tab;if(tab==='chat'){changeThread(null);}showRooms=false;modal=null;render();return;}
  const a=e.target.closest('[data-auth]');if(a&&!busy){authMode=a.dataset.auth;render();return;}
  const ct=e.target.closest('[data-connect]');if(ct&&!busy){connectTab=ct.dataset.connect;render();return;}
  const b=e.target.closest('[data-action]');if(!b||b.disabled){return;}const action=b.dataset.action,id=b.dataset.id;
  if(voice&&['switchRoom','openThread','openChat','backChat','backDiscussions','newRoom','reply','discuss','team','signOut','linkAccount','agent','leaveRoomConfirm','deleteRoomConfirm','removeMemberConfirm'].includes(action)){notify('Send or discard your voice message before changing conversations.');return;}
  if(action==='agentContext'){if(showAgentContext){closeAgentContext(true);}else{showRooms=false;showAgentContext=true;render();document.getElementById('ai-code')?.focus();}}
  else if(action==='closeAgentContext'){closeAgentContext(true);}
  else if(action==='voiceStart'){request('voiceStart',{discussionId:threadId,replyTo:replyTo||(threadId?discussion()?.source.id:null)});}
  else if(['voiceStop','voiceDiscard','sendVoice'].includes(action)){request(action,{voiceId:voice?.id});}
  else if(action==='rooms'){showRooms=!showRooms;render();if(showRooms){document.querySelector('.room-option')?.focus();}}
  else if(['deleteRoomConfirm','leaveRoomConfirm','removeMemberConfirm'].includes(action)){openModal(action.replace('Confirm',''),{id});}
  else if(['deleteRoom','leaveRoom','removeMember'].includes(action)){request(action,{roomId:state.active,userId:modal.id});}
  else if(action==='repository'){openModal('repository');}
  else if(action==='messageMenu'){openModal('messageMenu',{id});}
  else if(action==='backDiscussions'){changeThread(null);tab='discussions';render();}
  else if(action==='newRoom'){showRooms=false;tab='connect';render();}
  else if(action==='openChat'||action==='backChat'){changeThread(null);tab='chat';render();document.getElementById('compose')?.focus();}
  else if(action==='team'){tab='team';render();}
  else if(action==='account'){accountLanguage=preferredLanguage();openModal('account');}
  else if(action==='linkAccount'){modal=null;forceSignIn=true;render();}
  else if(action==='switchRoom'){if(draft||attachment){notify('Send or clear your draft before switching rooms.');return;}showRooms=false;threadId=null;tab='chat';request('switchRoom',{id});}
  else if(action==='reply'){modal=null;replyTo=id;render();document.getElementById('compose')?.focus();}
  else if(action==='clearAgentSource'){agentSourceId=null;render();}
  else if(action==='cancelReply'){replyTo=null;render();}
  else if(action==='detach'){attachment=null;retryId=null;render();}
  else if(action==='attach'){host.postMessage({type:'selection'});}
  else if(['openFile','showDiff'].includes(action)){host.postMessage({type:action,id});}
  else if(action==='loadOlder'){request('loadOlder');}
  else if(action==='discuss'){const d=room().discussions?.find(d=>d.source.id===id);if(d){openThread(d.id);}else{openModal('discussion',{id,title:(source(id)?.text||'Code discussion').slice(0,120)});}}
  else if(action==='openThread'){openThread(id);}
  else if(action==='createDiscussion'){request('createDiscussion',{id:modal.id,title:modal.title});}
  else if(action==='resolveDiscussion'){request('resolveDiscussion',{id,status:b.dataset.status});}
  else if(action==='pin'){const m=source(id);openModal('pin',{id,title:m?.text.slice(0,90)||'Project decision',text:m?.text||'',discussionId:threadId||room().discussions?.find(d=>d.source.id===id)?.id});}
  else if(action==='savePin'){request('pin',{id:modal.id,title:modal.title,text:modal.text,discussionId:modal.discussionId});}
  else if(action==='newProposal'){
   const discussion=room().discussions?.find(d=>d.id===id);
   openModal('decisionEdit',{roomId:state.active,heading:'New proposal',change:{action:'propose',id:crypto.randomUUID(),discussionId:discussion?.id||'',title:discussion?.title.slice(0,100)||'',text:''}});
  }
  else if(['reviewProposal','replaceDecision','linkImplementation'].includes(action)){
   const pin=room().pins?.find(item=>item.id===id);
   if(!pin){return;}
   let heading,change;
   if(action==='reviewProposal'){heading='Review proposal';change={action:'accept',id,title:pin.title,text:pin.text};}
   if(action==='replaceDecision'){heading='Replace decision';change={action:'replace',id,replacementId:'',newId:crypto.randomUUID(),title:'',text:''};}
   if(action==='linkImplementation'){heading='Link implementation';change={action:'addLink',id,kind:'pr',url:''};}
   openModal('decisionEdit',{roomId:state.active,heading,change,returnId:id});
  }
  else if(action==='cancelDecisionEdit'){
   if(modal.returnId){openModal('decision',{id:modal.returnId});}else{closeModal();}
  }
  else if(action==='removeImplementation'){request('updateDecision',{roomId:state.active,change:{action:'removeLink',id,url:b.dataset.url}});}
  else if(action==='unpinConfirm'){openModal('unpin',{id});}
  else if(action==='unpin'){request('unpin',{id});}
  else if(action==='openDecision'){openModal('decision',{id});}
  else if(action==='react'){openModal('react',{id});}
  else if(action==='reaction'){modal=null;request('reaction',{id,emoji:b.dataset.emoji});}
  else if(action==='mentions'){openModal('mentions');}
  else if(action==='mentionUser'){const m=room().members.find(m=>m.id===id);draft+=(draft&&!/\s$/.test(draft)?' ':'')+'@'+m.name.replace(/\s+/g,'_')+' ';modal=null;render();document.getElementById('compose')?.focus();}
  else if(action==='agent'){openAgent(id);}
  else if(action==='cancelAgent'||action==='dismissAgent'){resetAgent();render();}
  else if(action==='retryAgent'){runAgent(agentResult.question);}
  else if(action==='shareAgent'){request('shareAgent',{answerId:agentResult.answerId});}
  else if(action==='inviteModal'){openModal('invite');}
  else if(action==='callMute'||action==='callLeave'){request('callControl',{action:action==='callMute'?'mute':'leave'});}
  else if(action==='googleSignIn'){request('googleSignIn');}
  else if(action==='setLanguage'){request('setLanguage',{language:accountLanguage});}
  else if(action==='translateMenu'){openModal('translate',{id,language:preferredLanguage()});}
  else if(action==='translateMessage'){request('translateMessage',{roomId:state.active,id:modal.id,language:modal.language});}
  else if(action==='hideTranslation'){translations.delete(translationKey(id));render();}
  else if(action==='signOut'){modal=null;request('signOut');}
  else if(action==='renewInvite'){request('renewInvite');}
  else if(action==='linkRoom'){request('linkRoom');}
  else if(action==='close'){closeModal();}
  else{host.postMessage({type:action});}
 });
 document.addEventListener('click',e=>{if(showAgentContext&&!e.target.closest('#agent-context-popover,[data-action="agentContext"]')){closeAgentContext();}if(showRooms&&!e.target.closest('.workspace-header')){showRooms=false;document.getElementById('room-menu')?.remove();document.querySelector('.room-selector')?.setAttribute('aria-expanded','false');}});
 document.addEventListener('focusin',e=>{if(showAgentContext&&!e.target.closest('#agent-context-popover,[data-action="agentContext"]')){closeAgentContext();}});
 window.addEventListener('resize',()=>{resizeComposer();positionAgentContext();});
 window.addEventListener('message',e=>{const data=e.data;
  if(data?.type==='voiceState'){updateVoice(data);return;}
  if(data?.type==='state'){if(!state.active&&data.active&&!saved.tab&&pending?.type!=='createRoom'){tab='chat';}const signature=JSON.stringify(data);if(signature===last){return;}last=signature;if(state.active&&state.active!==data.active){clearVoice();draftSlots.clear();scrollPositions.clear();discussionFilter='open';decisionFilter='all';draft='';attachment=null;replyTo=null;threadId=null;retryId=null;modal=null;resetAgent();}state=data;const nextScope=scopeKey();if(nextScope!==agentScope){translations.clear();showAgentContext=false;if(agentScope){attachment=null;}resetAgent();agentScope=nextScope;const grant=aiGrants[agentScope]||{};aiOptions={code:grant.code===true,messages:grant.messages===true,diff:grant.diff===true};}if(!roomName&&data.repo){roomName=data.repo.name;}render();}
  if(data?.type==='agentCanceled'&&agentRequest?.operation===data.operation){agentRequest=null;agentResult=null;render();return;}
  if(data?.type==='agentResponse'){
   const pending=agentRequest;if(!pending||data.operation!==pending.operation||data.roomId!==state.active||pending.scope!==scopeKey()||pending.threadId!==threadId){return;}
   agentRequest=null;agentResult={...data,question:pending.question};
   if(data.status==='answer'&&draft===pending.draft){draft='';retryId=null;if(attachment===pending.attachment){attachment=null;}agentSourceId=null;}
   render();return;
  }
  if(data?.type==='notice'){if(pending?.type==='translateMessage'&&modal?.type==='translate'){modal.error=data.text;render();}else{notify(data.text);}}
  if(data?.type==='translation'&&pending?.type==='translateMessage'&&data.operation===pending.operation&&data.roomId===state.active&&typeof data.text==='string'&&Object.hasOwn(translationLanguages,data.language)){translations.set(translationKey(data.id),{language:data.language,text:data.text});if(translations.size>100){translations.delete(translations.keys().next().value);}modal=null;render();}
  if(data?.type==='selection'){attachment=data.attachment;tab='chat';render();document.getElementById('compose')?.focus();}
  if(data?.type==='referenceStatus'){referenceStatus[data.id]=data.differs;render();}
  if(data?.type==='discussionCreated'){openThread(data.id);}
  if(data?.type==='result'&&data.operation===pending?.operation){const type=pending.type;busy=false;pending=null;
   if(data.ok&&type==='updateDecision'&&data.roomId===state.active&&data.decisionId){modal={type:'decision',id:data.decisionId};}
   if(data.ok&&type==='shareAgent'&&agentResult){agentResult.shared=true;agentResult.shareError='';}if(data.ok&&type==='send'){agentSourceId=null;draft='';attachment=null;replyTo=null;retryId=null;modal=null;}if(data.ok&&type==='joinRoom'){tab='chat';invite='';threadId=null;}if(data.ok&&type==='createRoom'){tab='chat';roomName='';}if(data.ok&&['deleteRoom','leaveRoom','removeMember','pin','unpin','createDiscussion','signIn','googleSignIn','signOut','setLanguage'].includes(type)){modal=null;}if(data.ok&&type==='signOut'){clearVoice();draftSlots.clear();draft='';attachment=null;replyTo=null;resetAgent();aiGrants={};aiOptions={code:false,messages:false,diff:false};forceSignIn=false;}if(data.ok&&['signIn','googleSignIn'].includes(type)){forceSignIn=false;tab=state.active?'chat':'connect';}render();if(type==='send'){document.getElementById('compose')?.focus();}}
 });
 host.postMessage({type:'ready'});
})();
