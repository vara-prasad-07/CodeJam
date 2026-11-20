import { spawn, execFile, ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import * as path from 'node:path';
import { tmpdir } from 'node:os';

export interface VoiceAttachment { url: string; duration: number; mimeType: 'audio/wav' }
export interface VoiceDestination { roomId: string; discussionId?: string; replyTo?: string }
export interface Microphone { id: number; name: string; isDefault: boolean }
export interface VoiceState extends VoiceDestination {
 id: string; clientId: string; phase: 'starting' | 'recording' | 'stopping' | 'preview' | 'uploading';
 duration: number; level: number; startedAt?: number; progress?: number; error?: string;
}
export const MAX_VOICE_BYTES = 1924096;
export function validateWav(data: Buffer) {
 if (data.length < 44 || data.length > MAX_VOICE_BYTES || data.toString('ascii',0,4) !== 'RIFF' || data.toString('ascii',8,12) !== 'WAVE' || data.readUInt32LE(4) + 8 !== data.length) { throw new Error('Invalid voice recording. Record another message.'); }
 let format = false, frames = 0;
 for (let offset = 12; offset + 8 <= data.length;) {
  const type = data.toString('ascii',offset,offset+4), size = data.readUInt32LE(offset+4), start = offset+8;
  if (start + size > data.length) { throw new Error('The recording is incomplete. Record another message.'); }
  if (type === 'fmt ') { format = size >= 16 && data.readUInt16LE(start) === 1 && data.readUInt16LE(start+2) === 1 && data.readUInt32LE(start+4) === 16000 && data.readUInt16LE(start+12) === 2 && data.readUInt16LE(start+14) === 16; }
  if (type === 'data') { if (frames || size % 2) { throw new Error('Invalid voice audio data.'); } frames = size/2; }
  offset = start + size + (size % 2);
 }
 const duration = frames/16000;
 if (!format || duration < 1 || duration > 60) { throw new Error('Record between 1 and 60 seconds of audio.'); }
 return duration;
}
export function recorderPath(root: string, platform: string = process.platform, arch: string = process.arch) {
 const supported = platform === 'win32' ? ['x64','arm64','ia32'] : platform === 'darwin' || platform === 'linux' ? ['x64','arm64'] : [];
 if (!supported.includes(arch)) { return undefined; }
 const targets = [`${platform}-${arch}`];
 // A 32-bit Windows helper runs on x64 Windows without an extra runtime/install.
 if (platform === 'win32' && arch === 'x64') { targets.push('win32-ia32'); }
 return targets.map(target => path.join(root,'native','bin',target,platform==='win32'?'recorder.exe':'recorder')).find(file => existsSync(file));
}
export class VoiceRecorder {
 state?: VoiceState;
 private child?: ChildProcessWithoutNullStreams;
 private folder?: string;
 private audio?: Buffer;
 private epoch = 0;
 private verified?: string;
 private watchdog?: ReturnType<typeof setTimeout>;
 private stopped?: Promise<void>;
 private disposePending?: Promise<void>;
 constructor(private root: string, private changed: (state?: VoiceState, audioBase64?: string, error?: string) => void, private processes = {spawn,execFile}) {}
 get available() { return Boolean(recorderPath(this.root)); }
 private emit(audio = false, error?: string) { this.changed(this.state ? {...this.state} : undefined, audio ? this.audio?.toString('base64') : undefined, error); }
 private async executable() {
  const file = recorderPath(this.root);
  if (!file) { throw new Error('Voice recording is unavailable for this platform. This extension needs its bundled native recorder.'); }
  if (this.verified !== file) {
   const [binary, expected] = await Promise.all([readFile(file),readFile(path.join(path.dirname(file),'sha256.txt'),'utf8')]);
   if (createHash('sha256').update(binary).digest('hex') !== expected.trim()) { throw new Error('The native recorder is damaged. Reinstall CodeJam before recording.'); }
   this.verified = file;
  }
  return file;
 }
 async devices(): Promise<Microphone[]> {
  const file = await this.executable();
  const output = await new Promise<string>((resolve,reject) => this.processes.execFile(file,['--list'],{windowsHide:true,timeout:8000,maxBuffer:64000},(error,stdout) => error ? reject(new Error('Cannot list microphones. Check microphone permissions and your audio service.')) : resolve(stdout)));
  const result = JSON.parse(output);
  if (result.type !== 'devices' || !Array.isArray(result.devices)) { throw new Error('Unexpected microphone device response.'); }
  return result.devices.filter((d:Microphone) => Number.isInteger(d.id) && typeof d.name === 'string');
 }
 async start(destination: VoiceDestination, deviceName = '') {
  if (this.state) { throw new Error('Finish or discard your current voice message first.'); }
  const epoch = ++this.epoch;
  this.state = {...destination,id:randomUUID(),clientId:randomUUID(),phase:'starting',duration:0,level:0}; this.emit();
  try {
   const file = await this.executable();
   const devices = deviceName ? await this.devices() : [];
   const index = deviceName ? devices.find(d => d.name === deviceName)?.id : -1;
   if (index === undefined) { throw new Error('Your selected microphone is disconnected. Use CodeJam: Select Microphone to choose another.'); }
   if (epoch !== this.epoch) { return; }
   const folder = await mkdtemp(path.join(tmpdir(),'codejam-voice-'));
   if (epoch !== this.epoch) { await this.removeFolder(folder); return; }
   this.folder = folder;
   const output = path.join(folder,'message.wav');
   const child = this.processes.spawn(file,['--record',output,String(index)],{windowsHide:true,stdio:'pipe'}); this.child = child;
   let lines = '', diagnostic = '', ready = false, nativeError = '';
   await new Promise<void>((resolve,reject) => {
    const startup = setTimeout(() => { reject(new Error('Microphone startup timed out. Check system microphone permission.')); child.kill(); },10000);
    this.stopped = new Promise<void>(closed => {
     child.on('error',error => { clearTimeout(startup); reject(error); closed(); });
     child.on('close',async code => {
      clearTimeout(startup); if (epoch === this.epoch) { clearTimeout(this.watchdog); }
      if (this.child === child) { this.child = undefined; }
      if (epoch === this.epoch) {
       if (!ready) { reject(new Error(nativeError || diagnostic.trim() || 'The microphone could not start.')); }
       else if (code !== 0 || nativeError) { await this.fail(nativeError || 'The microphone stopped unexpectedly. Please record again.'); }
       else {
        try {
         const audio = await readFile(output), duration = validateWav(audio);
         if (epoch === this.epoch && this.state) { this.audio = audio; await this.clean(); Object.assign(this.state,{phase:'preview',duration,level:0}); this.emit(true); }
        } catch (error) { if (epoch === this.epoch) { await this.fail((error as Error).message); } }
       }
      }
      closed();
     });
    });
    child.stderr.on('data',chunk => { diagnostic = (diagnostic + chunk.toString()).slice(-2000); });
    child.stdin.on('error',() => { /* A cancelled/stopped helper may have closed stdin. */ });
    child.stdout.on('data',chunk => {
     lines += chunk.toString();
     if (lines.length > 64000) { nativeError = 'Invalid native recorder response.'; child.kill(); return; }
     let split;
     while ((split = lines.indexOf('\n')) >= 0) {
      const line = lines.slice(0,split); lines = lines.slice(split+1);
      try {
       const event = JSON.parse(line);
       if (epoch !== this.epoch || !this.state) { continue; }
       if (event.type === 'error') { nativeError = String(event.message).slice(0,500); }
       if (event.type === 'ready') { ready = true; clearTimeout(startup); Object.assign(this.state,{phase:'recording',startedAt:Date.now()}); this.emit(); resolve(); this.watchdog = setTimeout(() => { void this.stop(); },61000); }
       if (event.type === 'progress' && Number.isFinite(event.duration) && Number.isFinite(event.level)) { this.state.duration = Math.min(60,Math.max(0,event.duration)); this.state.level = Math.min(1,Math.max(0,event.level)); this.emit(); }
      } catch { nativeError = 'Invalid native recorder response.'; child.kill(); }
     }
    });
   });
  } catch (error) { if (epoch === this.epoch) { await this.cancel(); } throw error; }
 }
 async stop() {
  if (this.state?.phase !== 'recording' || !this.child) { return; }
  const child = this.child, stopped = this.stopped;
  this.state.phase = 'stopping'; this.emit(); child.stdin.end('\n');
  const timer = setTimeout(() => child.kill(),3000);
  await stopped; clearTimeout(timer);
 }
 payload(id: unknown) {
  if (!this.state || this.state.id !== id || this.state.phase !== 'preview' || !this.audio) { throw new Error('Preview a voice recording before sending.'); }
  return {state:{...this.state},base64:this.audio.toString('base64')};
 }
 uploading(progress = 0) { if (this.state) { Object.assign(this.state,{phase:'uploading',progress,error:undefined}); this.emit(); } }
 retry(error: string) { if (this.state) { Object.assign(this.state,{phase:'preview',progress:undefined,error}); this.emit(); } }
 async cancel() {
  ++this.epoch; clearTimeout(this.watchdog);
  const child = this.child, stopped = this.stopped, folder = this.folder;
  this.child = undefined; this.stopped = undefined; this.folder = undefined;
  child?.kill(); this.state = undefined; this.audio = undefined; this.emit();
  await stopped; await this.removeFolder(folder);
 }
 private async fail(error: string) { this.state = undefined; this.audio = undefined; this.emit(false,error); await this.clean(); }
 private async clean() {
  const folder = this.folder; this.folder = undefined;
  await this.removeFolder(folder);
 }
 private async removeFolder(folder?: string) {
  if (folder && path.dirname(folder) === tmpdir() && path.basename(folder).startsWith('codejam-voice-')) { await rm(folder,{recursive:true,force:true,maxRetries:3,retryDelay:100}).catch(() => undefined); }
 }
 dispose() { this.disposePending = this.cancel(); return this.disposePending; }
}
