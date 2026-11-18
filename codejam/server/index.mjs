import http from 'node:http';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createNexconnService } from './nexconn.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const fail = (status, message) => { const error = new Error(message); error.status = status; throw error; };
const string = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
export async function createRoomServer({ file = path.join(import.meta.dirname, '.data', 'nexconn-rooms.json'), nexconn = createNexconnService() } = {}) {
 let db = { sessions: [], rooms: [] };
 try { db = JSON.parse(await readFile(file, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') { throw error; } }
 let queue = Promise.resolve();
 async function save() {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file + '.tmp', JSON.stringify(db), { mode: 0o600 });
  await rename(file + '.tmp', file);
 }
 async function route(req) {
  const url = new URL(req.url, 'http://localhost');
  if (req.headers.origin) { fail(403, 'The API is accessed by the extension host, not browser origins.'); }
  let body = {};
  if (req.method === 'POST') {
   let text = '';
   for await (const chunk of req) { text += chunk; if (Buffer.byteLength(text) > 100000) { fail(413, 'Request is too large.'); } }
   try { body = JSON.parse(text); } catch { fail(400, 'Invalid JSON.'); }
   if (!body || typeof body !== 'object' || Array.isArray(body)) { fail(400, 'Expected a JSON object.'); }
  }
  if (req.method === 'GET' && url.pathname === '/health') { return { mode: 'development', provider: 'nexconn' }; }
  if (req.method === 'POST' && url.pathname === '/sessions') {
   if (!string(body.name, 60)) { fail(400, 'Display name must have 1–60 characters.'); }
   const token = randomBytes(32).toString('hex');
   const user = { id: 'cj' + randomUUID().replaceAll('-', ''), name: body.name.trim(), tokenHash: hash(token) };
   await nexconn.session(user); // Register this identity with Nexconn before it can own or join groups.
   db.sessions.push(user); await save();
   return { token, user: { id: user.id, name: user.name } };
  }
  const token = req.headers.authorization?.replace(/^Bearer /, '');
  const user = token && db.sessions.find(s => s.tokenHash === hash(token));
  if (!user) { fail(401, 'Session expired or unavailable. Run CodeJam: Reset Server Session and retry.'); }
  if (req.method === 'POST' && url.pathname === '/chat/session') { return nexconn.session(user); }
  const publicRoom = room => ({ id: room.id, channelId: room.channelId, name: room.name, repository: room.repository, createdAt: room.createdAt, invite: room.invite, members: room.members, messages: [] });
  if (req.method === 'GET' && url.pathname === '/rooms') { return { userId: user.id, provider: 'nexconn', rooms: db.rooms.filter(r => r.members.some(m => m.id === user.id)).map(publicRoom) }; }
  if (req.method === 'POST' && url.pathname === '/rooms') {
   if (!string(body.name, 64) || !string(body.repository, 200)) { fail(400, 'A room name (1–64 characters) and repository are required.'); }
   const room = { id: randomUUID(), channelId: 'cj' + randomBytes(16).toString('hex'), name: body.name.trim(), repository: body.repository.trim(), createdAt: new Date().toISOString(), invite: 'cdj-' + randomBytes(18).toString('hex'), members: [{ id: user.id, name: user.name }] };
   await nexconn.createGroup(room);
   db.rooms.push(room); await save(); return { room: publicRoom(room) };
  }
  if (req.method === 'POST' && url.pathname === '/rooms/join') {
   if (!string(body.invite, 200)) { fail(400, 'Invitation code is required.'); }
   const room = db.rooms.find(r => r.invite === body.invite.trim());
   if (!room) { fail(404, 'Invitation not found. Check the code and server URL.'); }
   await nexconn.joinGroup(room, user);
   if (!room.members.some(m => m.id === user.id)) { room.members.push({ id: user.id, name: user.name }); await save(); }
   return { room: publicRoom(room) };
  }
  // Message send/receive/history belong exclusively to the Nexconn Chat SDK.
  fail(404, 'Endpoint not found.');
 }
 const server = http.createServer((req, res) => {
  queue = queue.then(async () => {
   const before = structuredClone(db);
   try {
    const data = await route(req);
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data));
   } catch (error) {
    db = before;
    res.writeHead(error.status || 500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: error.status ? error.message : 'Could not save room metadata. Retry your action.' }));
   }
  }).catch(() => { if (!res.writableEnded) { res.destroy(); } });
 });
 server.requestTimeout = 20000;
 return server;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
 try {
  const server = await createRoomServer({ file: process.env.CODEJAM_DATA_FILE || undefined });
  const port = Number(process.env.PORT || 3000);
  server.listen(port, '127.0.0.1', () => console.log(`CodeJam Nexconn token/room API: http://127.0.0.1:${port}`));
 } catch (error) { console.error(error.message); process.exitCode = 1; }
}
