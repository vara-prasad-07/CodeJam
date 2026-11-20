import { createHash, randomBytes, randomUUID } from 'node:crypto';

export function createNexconnService({ appKey = process.env.NEXCONN_APP_KEY, appSecret = process.env.NEXCONN_APP_SECRET, region = process.env.NEXCONN_REGION || 'SG', fetchImpl = fetch } = {}) {
 if (!appKey?.trim() || !appSecret?.trim()) { throw new Error('Set NEXCONN_APP_KEY and NEXCONN_APP_SECRET in codejam/server/.env.'); }
 const regions = { SG: 'https://api.sg-light-api.com', NA: 'https://api.us-light-api.com', SA: 'https://api.sau-light-api.com' };
 if (!regions[region]) { throw new Error('NEXCONN_REGION must be SG, NA or SA and match the Nexconn application.'); }
 async function call(route, payload) {
  const nonce = randomBytes(8).toString('hex'), timestamp = String(Date.now());
  const signature = createHash('sha1').update(appSecret.trim() + nonce + timestamp).digest('hex');
  let response;
  try {
   response = await fetchImpl(regions[region] + route, { method: 'POST', headers: { 'Content-Type': 'application/json', 'App-Key': appKey.trim(), Nonce: nonce, Timestamp: timestamp, Signature: signature, 'X-Request-ID': randomUUID(), Connection: 'close' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(15000) });
  } catch { const error = new Error('Nexconn API is unreachable. Check the network and NEXCONN_REGION.'); error.status = 502; throw error; }
  let data;
  try { data = await response.json(); } catch { data = {}; }
  if (!response.ok || data.code !== 0) {
   // Do not forward vendor payloads, tokens, request headers, or keys into logs/UI.
   const error = new Error(`Nexconn rejected ${route} (HTTP ${response.status}, code ${data.code ?? 'unknown'}). Check credentials, region, and enabled Chat services.`);
   error.status = 502; throw error;
  }
  return data.result || data.data || data;
 }
 return {
  async session(user) {
   const data = await call('/v4/auth/access-token/issue', { userId: user.id, name: user.name });
   if (typeof data.accessToken !== 'string') { throw new Error('Nexconn returned no access token.'); }
   return { appKey: appKey.trim(), token: data.accessToken, userId: user.id, region };
  },
  async createGroup(room) {
   await call('/v4/group-channel/create', { channelId: room.channelId, name: room.name, owner: room.members[0].id, permissions: { joinPerm: 3, memInvitePerm: 0 } });
   // Ownership alone does not guarantee chat/history membership.
   await call('/v4/group-channel/join', { channelId: room.channelId, userIds: [room.members[0].id] });
  },
  joinGroup: (room, user) => call('/v4/group-channel/join', { channelId: room.channelId, userIds: [user.id] }),
  leaveGroup: (room, userId) => call('/v4/group-channel/leave', { channelId: room.channelId, userIds: [userId] }),
  transferAndLeave: (room, newOwner) => call('/v4/group-channel/transfer/owner', { channelId: room.channelId, newOwner, shouldLeave: 1 }),
  dismissGroup: room => call('/v4/group-channel/dismiss', { channelId: room.channelId }),
 };
}
