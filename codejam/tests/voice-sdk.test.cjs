const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');

test('Nexconn voice bridge uploads once, reports progress and normalizes history/live voice messages',async()=>{
 const listeners=[],posts=[],sent=[];let handler,finishUpload,voiceFile;
 const engine={initialize(){},addConnectionStatusHandler(){},addMessageHandler(_name,h){handler=h;},getConnectionStatus:()=>1,connect:async()=>({isOk:true,data:{userId:'me'}}),disconnect:async()=>{}};
 class GroupChannel {constructor(id){this.id=id;}async sendMediaMessage(params){
  sent.push(params);params.onUploadProgress(50);
  await new Promise(resolve=>finishUpload=resolve);
  return {isOk:true,data:{messageId:'voice1',messageType:'voice',channelIdentifier:{channelType:'group',channelId:this.id},senderUserId:'me',sentTime:1000,content:{...params.content,remoteUrl:'https://media.example/voice.wav',duration:2}}};
 }}
 const sdk={NCEngine:engine,AreaCode:{SG:'SG'},LogLevel:{ERROR:0},ConnectionStatus:{CONNECTED:1},ConnectionStatusHandler:class{constructor(values){Object.assign(this,values);}},MessageHandler:class{constructor(values){Object.assign(this,values);}},MessageType:{TEXT:'text',HD_VOICE:'voice'},GroupChannel,GroupChannelIdentifier:class{},BaseChannel:{},SendTextMessageParams:class{},ChannelType:{GROUP:'group'},MentionedType:{USERS:1},Helper:{createSendHDVoiceMessageParams:async file=>{voiceFile=file;return {isOk:true,data:{content:{duration:2}}};}}};
 const module={exports:{}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../out/nexconnClient.js'),'utf8'),{module,exports:module.exports,require:name=>{if(name==='./translation'){return {createTranslator:()=>({install(){},cancel(){}})};}assert.equal(name,'@nexconn/chat');return sdk;},Uint8Array,File,atob,console,globalThis:{addEventListener:(_type,fn)=>listeners.push(fn)}});
 module.exports.startNexconnBridge({postMessage:data=>posts.push(data)});
 const command=(requestId,name,input)=>listeners[0]({data:{type:'sdkCommand',requestId,command:name,input}});
 await command('connect','connect',{appKey:'key',region:'SG',token:'token',userId:'me'});
 const input={channelId:'group1',base64:Buffer.from('fake WAV for mocked decoder').toString('base64'),clientId:'stable-voice-id',replyTo:'root',discussionId:'thread'};
 const a=command('a','sendVoice',input),b=command('b','sendVoice',input);
 await new Promise(resolve=>setImmediate(resolve));assert.equal(sent.length,1);assert.equal(voiceFile.type,'audio/wav');assert.equal(JSON.parse(sent[0].content.extra).discussionId,'thread');
 assert.ok(posts.some(p=>p.type==='sdkUpload'&&p.clientId==='stable-voice-id'&&p.progress===50));
 finishUpload();await Promise.all([a,b]);
 const result=posts.find(p=>p.requestId==='a');assert.equal(result.ok,true);assert.equal(result.data.voice.url,'https://media.example/voice.wav');assert.equal(result.data.replyTo,'root');assert.equal(result.data.clientId,'stable-voice-id');
 await command('retry','sendVoice',input);assert.equal(sent.length,1,'retry of an acknowledged clip is deduplicated');
 handler.onMessageReceived({messages:[{messageId:'received',messageType:'voice',channelIdentifier:{channelType:'group',channelId:'group1'},senderUserId:'other',sentTime:2000,content:{remoteUrl:'https://media.example/received.wav',duration:5}}]});
 assert.equal(posts.at(-1).messages[0].voice.duration,5);assert.equal(posts.at(-1).messages[0].text,'');
});
