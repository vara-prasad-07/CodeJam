const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {createHash}=require('node:crypto');
const {EventEmitter}=require('node:events');
const {PassThrough}=require('node:stream');
const {VoiceRecorder,recorderPath,validateWav}=require('../out/voice');
const {createMessage}=require('../out/model');

function wav(seconds=2){
 const bytes=Math.round(seconds*32000),b=Buffer.alloc(44+bytes);
 b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(16000,24);b.writeUInt32LE(32000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(bytes,40);return b;
}
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'codejam-voice-test-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const dir=path.join(root,'native/bin',process.platform+'-'+process.arch);fs.mkdirSync(dir,{recursive:true});
 const binary=Buffer.from('fake recorder fixture'),file=path.join(dir,process.platform==='win32'?'recorder.exe':'recorder');
 fs.writeFileSync(file,binary);fs.writeFileSync(path.join(dir,'sha256.txt'),createHash('sha256').update(binary).digest('hex'));
 let child,output,spawns=0;
 const processes={spawn(_file,args){
  spawns++;output=args[1];fs.writeFileSync(output,wav());child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new PassThrough();
  child.kill=()=>{queueMicrotask(()=>child.emit('close',1));return true;};
  child.stdin.on('finish',()=>queueMicrotask(()=>child.emit('close',0)));
  queueMicrotask(()=>child.stdout.write(JSON.stringify({type:'ready'})+'\n'));
  return child;
 },execFile(_file,_args,_options,callback){queueMicrotask(()=>callback(null,JSON.stringify({type:'devices',devices:[{id:0,name:'USB microphone',isDefault:true}]})));}};
 return {root,processes,get child(){return child;},get output(){return output;},get spawns(){return spawns;}};
}
test('voice WAV validation enforces complete PCM audio, format and 1–60 second limits',()=>{
 assert.equal(validateWav(wav()),2);assert.equal(validateWav(wav(60)),60);
 for(const b of [wav(.5),wav(61),wav().subarray(0,100),Buffer.from('not audio')]){assert.throws(()=>validateWav(b));}
 const bad=wav();bad.writeUInt16LE(2,22);assert.throws(()=>validateWav(bad));
 const chunk=wav();chunk.writeUInt32LE(0xffffffff,40);assert.throws(()=>validateWav(chunk));
});
test('native recorder resolves the matching platform and Windows x64 fallback without a shell',t=>{
 const f=fixture(t);assert.ok(recorderPath(f.root));assert.equal(recorderPath(f.root,'freebsd','x64'),undefined);
 const dir=path.join(f.root,'native/bin/win32-ia32');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'recorder.exe'),'fixture');
 assert.ok(recorderPath(f.root,'win32','x64').includes('win32-ia32')||process.platform==='win32'&&process.arch==='x64');
});
test('native capture snapshots destination, previews locally, retains retry and cleans audio',async t=>{
 const f=fixture(t),events=[];
 const recorder=new VoiceRecorder(f.root,(state,base64,error)=>events.push({state,base64,error}),f.processes);t.after(()=>recorder.dispose());
 const destination={roomId:'room',discussionId:'thread',replyTo:'root'};await recorder.start(destination);destination.roomId='other-room';
 assert.equal(recorder.state.phase,'recording');assert.equal(recorder.state.roomId,'room');assert.equal(f.spawns,1);
 await assert.rejects(()=>recorder.start({roomId:'second'}),/Finish or discard/);
 await recorder.stop();assert.equal(recorder.state.phase,'preview');assert.equal(recorder.state.duration,2);
 assert.equal(fs.existsSync(f.output),false,'the temporary file is removed after local preview is loaded');
 const id=recorder.state.id,payload=recorder.payload(id);assert.equal(payload.state.discussionId,'thread');assert.equal(validateWav(Buffer.from(payload.base64,'base64')),2);
 recorder.uploading(45);assert.equal(recorder.state.phase,'uploading');recorder.retry('Upload failed');
 assert.equal(recorder.payload(id).base64,payload.base64);assert.equal(recorder.state.error,'Upload failed');
 await recorder.cancel();assert.equal(recorder.state,undefined);assert.throws(()=>recorder.payload(id));assert.equal(events.at(-1).state,undefined);
});
test('recorder cancellation kills capture, ignores late data and deletes its temporary file',async t=>{
 const f=fixture(t),events=[],recorder=new VoiceRecorder(f.root,(state,base64)=>events.push({state,base64}),f.processes);
 await recorder.start({roomId:'room'});await recorder.cancel();
 f.child.stdout.write(JSON.stringify({type:'progress',duration:40,level:1})+'\n');
 assert.equal(recorder.state,undefined);assert.equal(fs.existsSync(f.output),false);assert.ok(!events.some(e=>e.base64));
});
test('microphone selection, missing device and binary integrity fail before capture',async t=>{
 const f=fixture(t),recorder=new VoiceRecorder(f.root,()=>{},f.processes);
 assert.equal((await recorder.devices())[0].name,'USB microphone');
 await assert.rejects(()=>recorder.start({roomId:'r'},'Unplugged microphone'),/disconnected/);assert.equal(f.spawns,0);
 fs.writeFileSync(path.join(path.dirname(recorderPath(f.root)),'sha256.txt'),'bad');
 const damaged=new VoiceRecorder(f.root,()=>{},f.processes);await assert.rejects(()=>damaged.start({roomId:'r'}),/damaged/);assert.equal(f.spawns,0);
});
test('cancelling startup or replacing a cancelled capture cannot clobber a new session',async t=>{
 const f=fixture(t),recorder=new VoiceRecorder(f.root,()=>{},f.processes);t.after(()=>recorder.dispose());
 const pending=recorder.start({roomId:'cancel-before-ready'});await recorder.cancel();await pending;assert.equal(f.spawns,0);
 await recorder.start({roomId:'first'});
 const cancelled=recorder.cancel();const replacement=recorder.start({roomId:'second'});await Promise.all([cancelled,replacement]);
 assert.equal(recorder.state.roomId,'second');assert.equal(recorder.state.phase,'recording');await recorder.stop();assert.equal(recorder.state.phase,'preview');
});
test('voice-only chat messages validate remote URL and duration without requiring text',()=>{
 const voice={url:'https://media.example/clip.wav?signature=1',duration:2,mimeType:'audio/wav'},room={messages:[]},user={id:'me',name:'Me'};
 assert.deepEqual(createMessage({text:'',voice},user,room).voice,voice);
 for(const value of [{...voice,url:'file:///private.wav'},{...voice,url:'https://user:secret@media.example/a.wav'},{...voice,duration:NaN},{...voice,duration:61},{...voice,mimeType:'text/html'}]){assert.throws(()=>createMessage({voice:value},user,room));}
});
