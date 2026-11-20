import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createNexconnService} from './nexconn.mjs';

test('provider signs documented token, group and membership requests without transmitting the secret',async()=>{
 const calls=[];
 const service=createNexconnService({appKey:'public',appSecret:'server-only-secret',region:'SG',fetchImpl:async(url,options)=>{calls.push({url,...options});return {ok:true,status:200,json:async()=>({code:0,result:{accessToken:'token'}})};}});
 const session=await service.session({id:'user1',name:'Vara'});assert.equal(session.token,'token');assert.equal(session.appSecret,undefined);
 const room={channelId:'group1',name:'Room',members:[{id:'user1'}]};await service.createGroup(room);await service.joinGroup(room,{id:'user2'});
 assert.deepEqual(calls.map(c=>new URL(c.url).pathname),['/v4/auth/access-token/issue','/v4/group-channel/create','/v4/group-channel/join','/v4/group-channel/join']);
 for(const call of calls){assert.equal(call.headers.Signature,createHash('sha1').update('server-only-secret'+call.headers.Nonce+call.headers.Timestamp).digest('hex'));assert.ok(call.headers.Nonce.length<=18);assert.ok(!JSON.stringify(call).includes('server-only-secret'));}
 assert.deepEqual(JSON.parse(calls[2].body),{channelId:'group1',userIds:['user1']});
 assert.deepEqual(JSON.parse(calls[3].body),{channelId:'group1',userIds:['user2']});
 assert.equal(JSON.parse(calls[1].body).permissions.joinPerm,3);
});
test('missing keys or provider failures never enable a local messaging fallback or leak vendor payloads',async()=>{
 assert.throws(()=>createNexconnService({appKey:'',appSecret:''}),/Set NEXCONN_APP_KEY/);
 const service=createNexconnService({appKey:'public',appSecret:'private',fetchImpl:async()=>({ok:false,status:401,json:async()=>({code:1004,message:'private echoed data',accessToken:'never-log'})})});
 await assert.rejects(service.session({id:'user',name:'User'}),error=>error.status===502&&!error.message.includes('private')&&!error.message.includes('never-log'));
});


test('room management removes provider access and transfers an exiting owner',async()=>{
 const calls=[];
 const service=createNexconnService({appKey:'public',appSecret:'private',fetchImpl:async(url,options)=>{calls.push([new URL(url).pathname,JSON.parse(options.body)]);return {ok:true,status:200,json:async()=>({code:0})};}});
 const room={channelId:'group1'};
 await service.leaveGroup(room,'member');await service.transferAndLeave(room,'successor');await service.dismissGroup(room);
 assert.deepEqual(calls,[['/v4/group-channel/leave',{channelId:'group1',userIds:['member']}],['/v4/group-channel/transfer/owner',{channelId:'group1',newOwner:'successor',shouldLeave:1}],['/v4/group-channel/dismiss',{channelId:'group1'}]]);
});
