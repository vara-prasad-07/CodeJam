const {test}=require('node:test');
const assert=require('node:assert/strict');
const sdk=require('@nexconn/chat');
const {startNexconnBridge}=require('../out/nexconnClient.js');
function setup(t){
 const events=new EventTarget(),messages=[],waiters=new Map();let messageHandler,translationHandler,connected=false;
 t.mock.method(globalThis,'addEventListener',events.addEventListener.bind(events));
 t.mock.method(sdk.NCEngine,'initialize',()=>undefined);
 t.mock.method(sdk.NCEngine,'addConnectionStatusHandler',()=>undefined);
 t.mock.method(sdk.NCEngine,'addTranslateHandler',(_id,handler)=>{translationHandler=handler;});
 t.mock.method(sdk.NCEngine,'addMessageHandler',(_id,handler)=>{messageHandler=handler;});
 t.mock.method(sdk.NCEngine,'connect',async()=>{connected=true;return {isOk:true,code:0,data:{userId:'me'}};});
 t.mock.method(sdk.NCEngine,'getConnectionStatus',()=>connected?sdk.ConnectionStatus.CONNECTED:sdk.ConnectionStatus.DISCONNECTED);
 t.mock.method(sdk.NCEngine,'disconnect',async()=>{connected=false;});
 const packet=()=>{const m=new sdk.Message(new sdk.GroupChannelIdentifier('group1'),{text:'hello',extra:JSON.stringify({codejam:1,replyTo:'original',clientId:'retry1',attachment:{path:'test.ts',code:'let x=1;',line:1,endLine:1,branch:'main',commit:'abc'}})},sdk.MessageType.TEXT);m.messageId='vendor-message';m.senderUserId='me';m.sentTime=Date.now();return m;};
 const send=t.mock.method(sdk.GroupChannel.prototype,'sendMessage',async()=>({isOk:true,data:packet()}));
 const query=t.mock.method(sdk.BaseChannel,'createMessagesQuery',()=>({hasNext:false,loadNextPage:async()=>({isOk:true,data:{data:[packet()]}})}));
 startNexconnBridge({postMessage(data){messages.push(data);if(data.type==='sdkResult'){waiters.get(data.requestId)?.(data);}}});
 let seq=0;const call=(command,input={})=>new Promise(resolve=>{const requestId=String(++seq);waiters.set(requestId,resolve);events.dispatchEvent(new MessageEvent('message',{data:{type:'sdkCommand',requestId,command,input}}));});
 return {call,send,query,messages,packet,translated:results=>translationHandler._invoker.onTranslationCompleted({results}),receive:override=>messageHandler._invoker.onMessageReceived({messages:[override||packet()]})};
}
if(!globalThis.addEventListener){globalThis.addEventListener=()=>{};}
test('real SDK bridge uses GroupChannel send, message handler and cloud history, and caches acknowledged retries',async t=>{
 const h=setup(t);assert.equal((await h.call('connect',{appKey:'public',token:'token',userId:'me',region:'SG'})).ok,true);
 const result=await h.call('send',{channelId:'group1',text:'hello',clientId:'retry1'});assert.equal(result.data.id,'vendor-message');assert.equal(result.data.replyTo,'original');assert.equal(result.data.attachment.path,'test.ts');
 const sentParams=h.send.mock.calls[0].arguments[0];assert.ok(sentParams instanceof sdk.SendTextMessageParams);assert.equal(sentParams.content.text,'hello');assert.equal(JSON.parse(sentParams.content.extra).clientId,'retry1');
 await h.call('send',{channelId:'group1',text:'hello',clientId:'retry1'});assert.equal(h.send.mock.calls.length,1);
 h.receive();assert.equal(h.messages.find(m=>m.type==='sdkMessages').messages[0].id,'vendor-message');
 const history=await h.call('history',{channelId:'group1'});assert.equal(history.data.messages[0].id,'vendor-message');assert.equal(history.data.hasMore,false);
});
test('SDK send errors return failure and keep the same request available for retry',async t=>{
 const h=setup(t);const before=await h.call('send',{channelId:'group1',text:'hello',clientId:'id'});assert.equal(before.ok,false);
 await h.call('connect',{appKey:'public',token:'token',userId:'me',region:'SG'});
 h.send.mock.mockImplementationOnce(async()=>({isOk:false,code:234}));assert.equal((await h.call('send',{channelId:'group1',text:'hello',clientId:'id'})).ok,false);
 assert.equal((await h.call('send',{channelId:'group1',text:'hello',clientId:'id'})).ok,true);
});

test('Agent provenance is preserved in shared-message transport and received history',async t=>{
 const h=setup(t);await h.call('connect',{appKey:'public',token:'token',userId:'me',region:'SG'});
 const agent={question:'What is a vision model?',model:'test-model'};
 await h.call('send',{channelId:'group1',text:'An answer',clientId:'agent-answer',agent});
 assert.deepEqual(JSON.parse(h.send.mock.calls[0].arguments[0].content.extra).agent,agent);
 const packet=h.packet();packet.content.extra=JSON.stringify({codejam:1,agent});h.receive(packet);
 assert.deepEqual(h.messages.find(m=>m.type==='sdkMessages').messages[0].agent,agent);
});

test('private translation uses Nexconn auto detection, matches callbacks by message and language, and never sends chat',async t=>{
 const h=setup(t);await h.call('connect',{appKey:'public',token:'token',userId:'me',region:'SG'});
 const translate=t.mock.method(sdk.NCEngine.translateModule,'translateMessages',async()=>({isOk:true,code:0}));
 const resultPromise=h.call('translate',{id:'original',text:'Hello',language:'te'});
 await new Promise(r=>setImmediate(r));const params=translate.mock.calls[0].arguments[0];
 assert.equal(params.list[0].targetLanguage,'te');assert.equal(params.list[0].sourceLanguage,'auto');assert.equal(params.list[0].text,'Hello');
 h.translated([{identifier:'unrelated',code:0,translateInfo:{targetLanguage:'te',status:2,translatedText:'Ignore'}}]);
 h.translated([{identifier:'original',code:0,translateInfo:{targetLanguage:'te',status:2,translatedText:'నమస్కారం'}}]);
 const result=await resultPromise;assert.equal(result.ok,true);assert.equal(result.data.text,'నమస్కారం');assert.equal(h.send.mock.calls.length,0);
 assert.equal(h.messages.some(m=>m.type==='sdkMessages'),false);
});

test('translation provider rejection and invalid targets return private errors',async t=>{
 const h=setup(t);await h.call('connect',{appKey:'public',token:'token',userId:'me',region:'SG'});
 t.mock.method(sdk.NCEngine.translateModule,'translateMessages',async()=>({isOk:false,code:400}));
 assert.equal((await h.call('translate',{id:'m',text:'Hello',language:'xx'})).ok,false);
 const result=await h.call('translate',{id:'m',text:'Hello',language:'hi'});assert.equal(result.ok,false);assert.match(result.error,/translation access/);
});

test('translation callback failures and disconnects release waiting requests',async t=>{
 const h=setup(t);await h.call('connect',{appKey:'public',token:'token',userId:'me',region:'SG'});
 t.mock.method(sdk.NCEngine.translateModule,'translateMessages',async()=>({isOk:true,code:0}));
 const result=h.call('translate',{id:'m',text:'Hello',language:'en'});await new Promise(r=>setImmediate(r));
 h.translated([{identifier:'m',code:42}]);assert.equal((await result).ok,false);
 const waiting=h.call('translate',{id:'m2',text:'Hello',language:'hi'});await new Promise(r=>setImmediate(r));
 await h.call('disconnect');assert.equal((await waiting).ok,false);
});

test('translation timeouts and concurrent duplicate requests fail without sending chat',async t=>{
 const h=setup(t);await h.call('connect',{appKey:'public',token:'token',userId:'me',region:'SG'});
 t.mock.method(sdk.NCEngine.translateModule,'translateMessages',async()=>({isOk:true,code:0}));
 const {createTranslator}=require('../out/translation.js');const translator=createTranslator(20);translator.install();
 const input={id:'timeout-message',text:'Hello',language:'te'};
 const pending=translator.translate(input);await assert.rejects(translator.translate(input),/already being translated/);
 await assert.rejects(pending,/timed out/);assert.equal(h.send.mock.calls.length,0);
});


test('history membership rejection reports the actual cause instead of requesting cloud storage',async t=>{
 const h=setup(t);await h.call('connect',{appKey:'public',token:'token',userId:'me',region:'SG'});
 h.query.mock.mockImplementationOnce(()=>({loadNextPage:async()=>({isOk:false,code:22406})}));
 const result=await h.call('history',{channelId:'group1'});assert.equal(result.ok,false);assert.match(result.error,/not a member/);assert.doesNotMatch(result.error,/Enable cloud/);
});


test('installed Nexconn SDK accepts native voice params and returns voice metadata in live delivery',async t=>{
 const h=setup(t);await h.call('connect',{appKey:'public',token:'token',userId:'me',region:'SG'});
 const message=new sdk.Message(new sdk.GroupChannelIdentifier('group1'),{remoteUrl:'https://media.example/voice.wav',duration:2,format:'wav',extra:JSON.stringify({codejam:1,clientId:'voice1',replyTo:'root',discussionId:'thread'})},sdk.MessageType.HD_VOICE);
 message.messageId='voice';message.senderUserId='me';message.sentTime=Date.now();
 t.mock.method(sdk.Helper,'createSendHDVoiceMessageParams',async file=>{const params=new sdk.SendHDVoiceMessageParams({remoteUrl:'',duration:2,format:'wav'});params.file=file;return {isOk:true,data:params};});
 const upload=t.mock.method(sdk.GroupChannel.prototype,'sendMediaMessage',async params=>{assert.ok(params instanceof sdk.SendHDVoiceMessageParams);assert.equal(params.file.type,'audio/wav');assert.equal(JSON.parse(params.content.extra).discussionId,'thread');return {isOk:true,data:message};});
 const sent=await h.call('sendVoice',{channelId:'group1',base64:Buffer.from('mocked WAV decode').toString('base64'),clientId:'voice1',replyTo:'root',discussionId:'thread'});
 assert.equal(sent.ok,true);assert.equal(sent.data.voice.url,'https://media.example/voice.wav');assert.equal(upload.mock.calls.length,1);
 h.receive(message);assert.equal(h.messages.filter(m=>m.type==='sdkMessages').at(-1).messages[0].voice.duration,2);
});
