import { NCEngine, AreaCode, LogLevel } from '@nexconn/chat';
import { NCCallEngine, NCCallType, NCCallMediaType, NCCallLogLevel } from '@nexconn/call';

type Grant = { appKey: string; token: string; region: 'SG' | 'NA' | 'SA'; sessionToken: string; userId: string; callUserId: string; room: {id:string;name:string}; callUsers: {id:string;name:string;callUserId:string}[] };
const element = (id:string) => document.getElementById(id)!;
let grant: Grant, engine: NCCallEngine, callId = '', incoming = '', joined = false, muted = false, state = 'Ready', startedAt = '', lastControl = '', ticking = false;
let roster: {id:string;name:string;muted?:boolean;status?:string}[] = [];
const escape = (value:string) => value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
function showError(text:string){element('error').textContent=text;element('error').hidden=false;}
async function api(route:string,body?:unknown){const response=await fetch(route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(grant?{Authorization:'Bearer '+grant.sessionToken}:{})},body:body===undefined?undefined:JSON.stringify(body)});const data=await response.json();if(!response.ok){throw new Error(data.error||'Call service unavailable.');}return data;}
function render(){
 element('room-name').textContent=grant?.room.name||'Project huddle';element('call-status').textContent=state;element('identity').textContent=grant?.callUsers.find(u=>u.id===grant.userId)?.name||'Your session';
 const button=element('join') as HTMLButtonElement;button.textContent=incoming&&!joined?'Answer huddle':callId&&!joined?'Join huddle':'Start audio huddle';button.hidden=joined;
 (element('mute') as HTMLButtonElement).disabled=!joined;(element('leave') as HTMLButtonElement).disabled=!joined&&!incoming;element('mute').textContent=muted?'Unmute microphone':'Mute microphone';
 element('roster').innerHTML=(roster.length?roster:(grant?.callUsers||[]) as typeof roster).map(u=>`<div class="peer ${u.id===grant?.userId?'self':''}" data-peer="${escape(u.id)}"><div class="portrait">${escape(u.name[0]?.toUpperCase()||'?')}</div><strong>${escape(u.name)}</strong><span>${u.muted?'Mic off':u.status==='connected'?'In call':u.id===grant?.userId?'You':'Invited teammate'}</span><div class="voice-bar"><i></i></div></div>`).join('');
}
async function publish(event:string){if(!callId){return;}await api(`/rooms/${grant.room.id}/call`,{event,callId,muted,status:joined?'connected':'connecting'});}
async function leave(){if(callId){const result=await engine.endCall({callId});if(result.code!==0){throw new Error('Nexconn could not end this call ('+result.code+'). Retry.');}await publish('leave').catch(()=>undefined);callId='';incoming='';joined=false;state='Call ended';element('level').textContent='Microphone idle';render();}}
async function toggleMute(){const result=await engine.enableMicrophone(muted);if(result.code!==0){throw new Error('Microphone control failed ('+result.code+').');}muted=!muted;await publish('heartbeat');render();}
async function enter(){
 element('error').hidden=true;const button=element('join') as HTMLButtonElement;button.disabled=true;
 try{
  if(!navigator.mediaDevices?.getUserMedia){throw new Error('Use this page on localhost or HTTPS in a browser with microphone support.');}
  const permission=await navigator.mediaDevices.getUserMedia({audio:true,video:false});permission.getTracks().forEach(track=>track.stop());
  const current=await api(`/rooms/${grant.room.id}/call`);state='Connecting audio…';render();let result;
  if(incoming){result=await engine.acceptCall({callId:incoming});callId=incoming;}
  else if(current.call?.participants?.length){callId=current.call.callId;result=await engine.joinCall({callId});}
  else{const peers=grant.callUsers.filter(u=>u.id!==grant.userId);if(!peers.length){throw new Error('Invite a teammate to the project before starting a group huddle.');}result=await engine.startCall({calleeIds:peers.map(u=>u.callUserId),callType:NCCallType.MULTI,mediaType:NCCallMediaType.AUDIO,extra:JSON.stringify({roomId:grant.room.id}),targetId:grant.room.id});if('callId' in result){callId=result.callId||'';}}
  if(result.code!==0){throw new Error(`Nexconn audio connection failed (${result.code}). Check that calling is enabled for the App Key, then retry.`);}
  await publish('join');state=joined?'Connected':'Waiting for teammates…';render();
 }catch(error){state='Ready to retry';showError((error as Error).name==='NotAllowedError'?'Microphone permission was denied. Allow it in the browser’s address bar, then retry.':(error as Error).message);render();}finally{button.disabled=false;}
}
async function boot(){
 try{
  const ticket=location.hash.slice(1);history.replaceState(null,'',location.pathname);
  if(ticket){grant=await api('/calls/claim',{ticket});sessionStorage.setItem('codejam.call',JSON.stringify(grant));}
  else{const saved=sessionStorage.getItem('codejam.call');if(!saved){throw new Error('Open this huddle from the CodeJam Team tab.');}grant=JSON.parse(saved);}
  NCCallEngine.install();NCEngine.initialize({appKey:grant.appKey,areaCode:AreaCode[grant.region],logLevel:LogLevel.ERROR});engine=NCCallEngine.initialize({logOutputLevel:NCCallLogLevel.ERROR});
  engine.setCallEventHandler({
   onCallReceived(event){incoming=event.session.getCallId();callId=incoming;state='Incoming team huddle';render();},
   onCallConnected(event){callId=event.session.getCallId();joined=true;state='Connected';startedAt=new Date().toISOString();void publish('join').catch(e=>showError(e.message));render();},
   onCallEnded(){void publish('leave').catch(()=>undefined);joined=false;callId='';incoming='';state='Call ended';render();},
   onRemoteUserStateChanged(){void tick();},
  });
  engine.setConnectionQualityHandler({onAudioVolumeChanged(volumes){const level=volumes[grant.callUserId]||0;element('level').textContent=muted?'Microphone muted':level>4?'Your microphone is active':'Listening';for(const user of grant.callUsers){const bar=document.querySelector(`[data-peer="${user.id}"] .voice-bar i`) as HTMLElement|null;if(bar){bar.style.width=Math.min(100,volumes[user.callUserId]||0)+'%';}}}});
  const result=await NCEngine.connect({token:grant.token});if(!result.isOk){throw new Error('Nexconn signaling connection failed ('+result.code+'). Open the call from CodeJam again.');}
  state='Ready for your team';await tick();render();
 }catch(error){state='Connection unavailable';showError((error as Error).message);(element('join') as HTMLButtonElement).disabled=true;render();}
}
async function tick(){if(!grant||ticking){return;}ticking=true;try{const result=await api(`/rooms/${grant.room.id}/call`);if(!callId&&result.call?.participants?.length){callId=result.call.callId;}roster=result.call?.participants||[];if(!joined&&!incoming){state=roster.length?'A huddle is in progress':'Ready for your team';}if(joined){await publish('heartbeat');}if(result.control&&result.control.id!==lastControl){lastControl=result.control.id;if(result.control.action==='leave'){await leave();}if(result.control.action==='mute'&&joined){await toggleMute();}}render();}catch(error){showError((error as Error).message);}finally{ticking=false;}}
element('join').addEventListener('click',()=>void enter());element('mute').addEventListener('click',()=>void toggleMute().catch(e=>showError(e.message)));element('leave').addEventListener('click',()=>void leave().catch(e=>showError(e.message)));
element('retry').addEventListener('click',()=>location.reload());
window.addEventListener('pagehide',()=>{if(grant&&callId){void fetch(`/rooms/${grant.room.id}/call`,{method:'POST',keepalive:true,headers:{'Content-Type':'application/json',Authorization:'Bearer '+grant.sessionToken},body:JSON.stringify({event:'leave',callId})});void engine?.endCall({callId});}});
setInterval(()=>void tick(),3000);setInterval(()=>{element('timer').textContent=startedAt&&joined?new Date(Date.now()-Date.parse(startedAt)).toISOString().slice(14,19):'AUDIO ONLY';},1000);void boot();
