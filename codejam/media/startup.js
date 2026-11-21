// Keep startup outside #app so connection updates never restart the intro.
(() => {
 const splash=document.getElementById('startup'),video=document.getElementById('startup-video'),app=document.getElementById('app');
 if(!splash||!video||!app){return;}
 const message=document.getElementById('startup-message'),options=document.getElementById('startup-continue');
 const reducedMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)');
 let mediaDone=false,finished=false,phase='connecting';
 let playbackTimer,slowTimer,removeTimer;
 function dismiss(){
  if(finished){return;}
  finished=true;clearTimeout(playbackTimer);clearTimeout(slowTimer);
  video.pause();window.removeEventListener('message',onState);
  reducedMotion?.removeEventListener('change',onMotion);
  app.inert=false;app.removeAttribute('inert');app.removeAttribute('aria-hidden');
  document.body.classList.remove('startup-active');
  splash.setAttribute('aria-hidden','true');splash.inert=true;
  splash.classList.add('startup-leaving');
  if(document.activeElement===document.body||splash.contains(document.activeElement)){
   app.tabIndex=-1;app.focus({preventScroll:true});
  }
  removeTimer=setTimeout(()=>splash.remove(),reducedMotion?.matches?0:220);
 }
 function maybeDismiss(){if(mediaDone&&phase!=='connecting'){dismiss();}}
 function stillLogo(){
  if(finished){return;}
  video.pause();video.hidden=true;mediaDone=true;clearTimeout(playbackTimer);maybeDismiss();
 }
 function onMotion(){if(reducedMotion?.matches){stillLogo();}}
 function onState(event){
  const data=event.data;
  if(data?.type!=='state'||!['connecting','ready','sign-in','error'].includes(data.startup)){return;}
  phase=data.startup;
  message.textContent=phase==='ready'?'Your workspace is ready':phase==='sign-in'?'Opening sign in…':phase==='error'?'Opening connection options…':'Connecting to NexConn…';
  maybeDismiss();
 }
 video.addEventListener('ended',()=>{
  // A non-looping video retains its last frame; do not rewind or replace it.
  mediaDone=true;clearTimeout(playbackTimer);maybeDismiss();
 });
 video.addEventListener('error',stillLogo);
 options.addEventListener('click',dismiss);
 window.addEventListener('message',onState);
 reducedMotion?.addEventListener('change',onMotion);
 window.addEventListener('pagehide',()=>{clearTimeout(playbackTimer);clearTimeout(slowTimer);clearTimeout(removeTimer);},{once:true});
 slowTimer=setTimeout(()=>{
  message.textContent='Still connecting to NexConn…';options.hidden=false;
 },12000);
 // A missing/unsupported clip or stalled autoplay must never trap the user.
 playbackTimer=setTimeout(stillLogo,5000);
 video.muted=true;
 if(reducedMotion?.matches||video.error){stillLogo();}
 else{try{video.play()?.catch(stillLogo);}catch{stillLogo();}}
})();
