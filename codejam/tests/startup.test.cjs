const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const {JSDOM}=require('jsdom');
const source=readFileSync(join(__dirname,'../media/startup.js'),'utf8');

function setup(t,{reduced=false,rejected=false}={}){
 const dom=new JSDOM('<!doctype html><body class="startup-active"><section id="startup"><img id="startup-logo" alt="CodeJam"><video id="startup-video"></video><p id="startup-message"></p><button id="startup-continue" hidden>Open connection options</button></section><div id="app" inert aria-hidden="true"><input id="auth-email"></div>',{runScripts:'outside-only'});
 t.after(()=>dom.window.close());
 const w=dom.window,q=selector=>w.document.querySelector(selector),timers=new Map();let serial=0,plays=0,pauses=0,motionListener;
 w.setTimeout=(fn,ms)=>{const id=++serial;timers.set(id,{fn,ms});return id;};w.clearTimeout=id=>timers.delete(id);
 w.matchMedia=()=>({get matches(){return reduced;},addEventListener:(_event,fn)=>motionListener=fn,removeEventListener:()=>motionListener=null});
 const video=q('video');video.play=()=>{plays++;return rejected?Promise.reject(new Error('Autoplay blocked')):Promise.resolve();};video.pause=()=>pauses++;
 w.eval(source);
 return {w,q,video,emit:data=>w.dispatchEvent(new w.MessageEvent('message',{data:{type:'state',...data}})),end:()=>video.dispatchEvent(new w.Event('ended')),fail:()=>video.dispatchEvent(new w.Event('error')),timer:ms=>{for(const [id,timer] of [...timers]){if(timer.ms===ms){timers.delete(id);timer.fn();}}},counts:()=>({plays,pauses}),reduce:()=>{reduced=true;motionListener?.();}};
}

test('fast connection waits for the full intro and then reveals the workspace',t=>{
 const h=setup(t);h.emit({startup:'ready',connected:true});
 assert.ok(h.q('#app').hasAttribute('inert'));assert.equal(h.q('.startup-leaving'),null);
 h.end();assert.equal(h.q('#app').hasAttribute('inert'),false);assert.equal(h.q('#app').hasAttribute('aria-hidden'),false);
 assert.equal(h.w.document.body.classList.contains('startup-active'),false);assert.ok(h.q('.startup-leaving'));
 assert.equal(h.w.document.activeElement.id,'app');h.timer(220);assert.equal(h.q('#startup'),null);
});

test('slow connection holds the last frame without replaying or rebuilding the video',t=>{
 const h=setup(t);h.end();h.emit({startup:'connecting',connected:false});h.q('#app').innerHTML='<p>Refreshed workspace</p>';
 h.emit({startup:'connecting',connected:true});
 assert.equal(h.q('video'),h.video);assert.equal(h.video.hidden,false);assert.equal(h.video.loop,false);assert.equal(h.counts().plays,1);
 assert.ok(h.q('#app').hasAttribute('inert'),'SDK connection alone must not reveal a workspace still loading history');
 h.emit({startup:'ready',connected:true});assert.ok(h.q('.startup-leaving'));
 h.emit({startup:'connecting',connected:false});assert.equal(h.w.document.body.classList.contains('startup-active'),false,'later reconnects must not replay the intro');
});

for(const phase of ['sign-in','error']) test(phase+' exits the intro so authentication and recovery remain accessible',t=>{
 const h=setup(t);h.emit({startup:phase,connected:false,authenticated:phase!=='sign-in'});h.end();
 assert.equal(h.q('#app').hasAttribute('inert'),false);assert.ok(h.q('.startup-leaving'));
});

test('decoder failures and stalled playback fall back to the static logo and still wait for connection',t=>{
 for(const mode of ['error','stalled']){
  const h=setup(t);if(mode==='error'){h.fail();}else{h.timer(5000);}
  assert.equal(h.video.hidden,true);assert.ok(h.q('#startup-logo'));assert.ok(h.q('#app').hasAttribute('inert'));
  h.emit({startup:'ready'});assert.ok(h.q('.startup-leaving'));
 }
});

test('blocked autoplay uses the static logo without blocking a ready workspace',async t=>{
 const h=setup(t,{rejected:true});await Promise.resolve();assert.equal(h.video.hidden,true);
 h.emit({startup:'ready'});assert.equal(h.q('#app').hasAttribute('inert'),false);
});

test('reduced motion skips the animation and respects preference changes during playback',t=>{
 const h=setup(t,{reduced:true});assert.equal(h.counts().plays,0);assert.equal(h.video.hidden,true);
 h.emit({startup:'ready'});h.timer(0);assert.equal(h.q('#startup'),null);
 const later=setup(t);later.reduce();assert.equal(later.video.hidden,true);later.emit({startup:'ready'});assert.ok(later.q('.startup-leaving'));
});

test('extended waits offer a keyboard-accessible exit without requiring a connection result',t=>{
 const h=setup(t);assert.equal(h.q('#startup-continue').hidden,true);h.timer(12000);
 assert.equal(h.q('#startup-continue').hidden,false);assert.match(h.q('#startup-message').textContent,/Still connecting/);
 h.q('#startup-continue').focus();h.q('#startup-continue').click();assert.equal(h.q('#app').hasAttribute('inert'),false);
 assert.equal(h.w.document.activeElement.id,'app');h.timer(220);assert.equal(h.q('#startup'),null);
});
