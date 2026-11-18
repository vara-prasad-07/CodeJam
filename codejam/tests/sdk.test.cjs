const {test}=require('node:test');
const assert=require('node:assert/strict');
const sdk=require('@nexconn/chat');
const {startNexconnBridge}=require('../out/nexconnClient.js');
function setup(t){
 const events=new EventTarget(),messages=[],waiters=new Map();let messageHandler,connected=false;
 t.mock.method(globalThis,'addEventListener',events.addEventListener.bind(events));
 t.mock.method(sdk.NCEngine,'initialize',()=>undefined);
 t.mock.method(sdk.NCEngine,'addConnectionStatusHandler',()=>undefined);
 t.mock.method(sdk.NCEngine,'addMessageHandler',(_id,handler)=>{messageHandler=handler;});
 t.mock.method(sdk.NCEngine,'connect',async()=>{connected=true;return {isOk:true,code:0,data:{userId:'me'}};});
 t.mock.method(sdk.NCEngine,'getConnectionStatus',()=>connected?sdk.ConnectionStatus.CONNECTED:sdk.ConnectionStatus.DISCONNECTED);
 t.mock.method(sdk.NCEngine,'disconnect',async()=>{connected=false;});
 const packet=()=>{const m=new sdk.Message(new sdk.GroupChannelIdentifier('group1'),{text:'hello',extra:JSON.stringify({codejam:1,replyTo:'original',clientId:'retry1',attachment:{path:'test.ts',code:'let x=1;',line:1,endLine:1,branch:'main',commit:'abc'}})},sdk.MessageType.TEXT);m.messageId='vendor-message';m.senderUserId='me';m.sentTime=Date.now();return m;};
 const send=t.mock.method(sdk.GroupChannel.prototype,'sendMessage',async()=>({isOk:true,data:packet()}));
 const query=t.mock.method(sdk.BaseChannel,'createMessagesQuery',()=>({hasNext:false,loadNextPage:async()=>({isOk:true,data:{data:[packet()]}})}));
 startNexconnBridge({postMessage(data){messages.push(data);if(data.type==='sdkResult'){waiters.get(data.requestId)?.(data);}}});
 let seq=0;const call=(command,input={})=>new Promise(resolve=>{const requestId=String(++seq);waiters.set(requestId,resolve);events.dispatchEvent(new MessageEvent('message',{data:{type:'sdkCommand',requestId,command,input}}));});
 return {call,send,query,messages,packet,receive:()=>messageHandler._invoker.onMessageReceived({messages:[packet()]})};
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


test('history membership rejection reports the actual cause instead of requesting cloud storage',async t=>{
 const h=setup(t);await h.call('connect',{appKey:'public',token:'token',userId:'me',region:'SG'});
 h.query.mock.mockImplementationOnce(()=>({loadNextPage:async()=>({isOk:false,code:22406})}));
 const result=await h.call('history',{channelId:'group1'});assert.equal(result.ok,false);assert.match(result.error,/not a member/);assert.doesNotMatch(result.error,/Enable cloud/);
});
