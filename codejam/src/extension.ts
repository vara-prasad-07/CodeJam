import * as vscode from 'vscode';
import { randomBytes, randomUUID } from 'node:crypto';
import * as path from 'node:path';
import { realpath } from 'node:fs/promises';
import { detectRepository, Repository } from './repository';
import { createMessage, createRoom, LocalState, Room, ChatMessage } from './model';

export function activate(context: vscode.ExtensionContext) {
 const views = new Set<vscode.Webview>();
 const readyViews = new Set<vscode.Webview>();
 let shared: LocalState = { rooms: [] }, repo: Repository | undefined;
 let selectedFolder = context.workspaceState.get<string>('codejam.folder');
 let connection = 'Connecting to Nexconn…', refreshing = false, serverUserId = '';
 let queue = Promise.resolve(), sdkOwner: vscode.Webview | undefined, sdkConnected = false;
 const rpc = new Map<string, { owner: vscode.Webview; resolve(value: any): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>();
 const loaded = new Set<string>();
 const config = () => vscode.workspace.getConfiguration('codejam');
 const apiUrl = () => config().get<string>('apiUrl', 'http://127.0.0.1:3000').trim().replace(/\/$/, '');
 const name = () => config().get<string>('displayName', '').trim() || 'Developer';
 const snapshot = () => ({ type: 'state', ...shared, repo, mode: 'nexconn', connection, connected: sdkConnected, userId: serverUserId, displayName: name() });
 const broadcast = async () => { await Promise.all([...views].map(v => v.postMessage(snapshot()))); };
 const notice = (webview: vscode.Webview, text: string) => webview.postMessage({ type: 'notice', text });
 const activeRoom = () => shared.rooms.find(r => r.id === shared.active);

 async function request(route: string, body?: unknown): Promise<any> {
  const base = apiUrl();
  let url: URL;
  try { url = new URL(base); } catch { throw new Error('Set codejam.apiUrl to the backend URL, usually http://127.0.0.1:3000.'); }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) { throw new Error('Use HTTPS for a remote server, or HTTP on localhost.'); }
  const secretKey = `codejam.session.nexconn.${base}`;
  let token = await context.secrets.get(secretKey);
  const perform = async (target: string, payload?: unknown, bearer?: string) => {
   let response: Response;
   try { response = await fetch(base + target, { method: payload === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) }, body: payload === undefined ? undefined : JSON.stringify(payload), signal: AbortSignal.timeout(20000) }); }
   catch { throw new Error('Cannot reach the CodeJam backend. Run npm run server in codejam, check codejam.apiUrl, then retry.'); }
   const data = await response.json() as any;
   if (!response.ok) { throw new Error(data.error || `Room server returned ${response.status}.`); }
   return data;
  };
  if (!token) {
   const session = await perform('/sessions', { name: name() });
   token = session.token;
   await context.secrets.store(secretKey, token!);
  }
  return perform(route, body, token);
 }
 function sdk(command: string, input: unknown = {}): Promise<any> {
  const owner = sdkOwner;
  if (!owner) { return Promise.reject(new Error('Open a CodeJam view to connect the Nexconn Chat SDK.')); }
  const requestId = randomUUID();
  return new Promise((resolve, reject) => {
   const timer = setTimeout(() => { rpc.delete(requestId); reject(new Error('Nexconn SDK timed out. Your draft is kept. Click Reconnect and retry.')); }, 25000);
   rpc.set(requestId, { owner, resolve, reject, timer });
   void owner.postMessage({ type: 'sdkCommand', command, input, requestId }).then(ok => {
    if (!ok) { clearTimeout(timer); rpc.delete(requestId); reject(new Error('The Nexconn client view is unavailable. Reopen CodeJam and retry.')); }
   });
  });
 }
 function applyMessages(items: unknown) {
  if (!Array.isArray(items)) { return; }
  for (const item of items) {
   if (!item || typeof item !== 'object') { continue; }
   const r = shared.rooms.find(room => room.channelId === item.channelId);
   if (!r || typeof item.id !== 'string' || typeof item.userId !== 'string' || !Number.isFinite(Date.parse(item.createdAt))) { continue; }
   try {
    const user = { id: item.userId, name: r.members.find(m => m.id === item.userId)?.name || item.userId };
    const validated = createMessage({ text: item.text, attachment: item.attachment }, user, r);
    const message: ChatMessage = { ...validated, id: item.id, createdAt: item.createdAt,
     replyTo: typeof item.replyTo === 'string' ? item.replyTo.slice(0, 200) : undefined,
     clientId: typeof item.clientId === 'string' ? item.clientId : undefined };
    const index = r.messages.findIndex(m => m.id === message.id);
    if (index >= 0) { r.messages[index] = message; } else { r.messages.push(message); }
    r.messages.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id));
   } catch { /* Ignore malformed/unrecognized payloads from other clients. */ }
  }
 }
 async function loadHistory(older = false) {
  const r = activeRoom();
  if (!r?.channelId || !sdkConnected) { return; }
  const result = await sdk('history', { channelId: r.channelId, older });
  applyMessages(result.messages); r.hasMore = Boolean(result.hasMore); loaded.add(r.id);
 }
 async function ensureChat() {
  if (!sdkOwner || sdkConnected) { return; }
  const session = await request('/chat/session', {});
  await sdk('connect', session); // Only this selected webview receives the public key and per-user token.
  sdkConnected = true; connection = 'Connected to Nexconn';
 }
 async function refresh() {
  if (refreshing) { return; }
  refreshing = true;
  try {
   const folders = vscode.workspace.workspaceFolders || [];
   const folder = folders.find(f => f.uri.fsPath === selectedFolder) || folders[0];
   repo = folder ? await detectRepository(folder.uri.fsPath) : undefined;
   try {
    const result = await request('/rooms'); serverUserId = result.userId;
    const active = shared.active || context.workspaceState.get<string>(`codejam.active.nexconn.${apiUrl()}`);
    shared = { rooms: result.rooms.map((r: Room) => ({ ...r, messages: (shared.rooms.find(old => old.id === r.id)?.messages || []).map(m => ({ ...m, author: r.members.find(member => member.id === m.userId)?.name || m.author })), hasMore: shared.rooms.find(old => old.id === r.id)?.hasMore })), active: result.rooms.some((r: Room) => r.id === active) ? active : result.rooms[0]?.id };
    await ensureChat();
    if (shared.active && !loaded.has(shared.active)) { await loadHistory(); }
    connection = sdkConnected ? 'Connected to Nexconn' : 'Waiting for the Nexconn SDK client';
   } catch (error) { connection = (error as Error).message; }
   await broadcast();
  } finally { refreshing = false; }
 }
 async function handle(webview: vscode.Webview, input: unknown) {
  if (!input || typeof input !== 'object' || !('type' in input)) { return; }
  const data = input as Record<string, unknown>;
  const operation = typeof data.operation === 'string' ? data.operation : undefined;
  try {
   if (data.type === 'ready') { readyViews.add(webview); if (!sdkOwner) { sdkOwner = webview; } await refresh(); }
   else if (data.type === 'refresh') { loaded.clear(); await refresh(); }
   else if (data.type === 'settings') { await vscode.commands.executeCommand('workbench.action.openSettings', 'codejam'); }
   else if (data.type === 'chooseRepository') {
    const items = (vscode.workspace.workspaceFolders || []).map(f => ({ label: f.name, description: f.uri.fsPath, folder: f.uri.fsPath }));
    if (!items.length) { await vscode.commands.executeCommand('vscode.openFolder'); return; }
    const selected = await vscode.window.showQuickPick(items, { placeHolder: 'Choose the workspace folder whose repository to use' });
    if (selected) { selectedFolder = selected.folder; await context.workspaceState.update('codejam.folder', selectedFolder); await refresh(); }
   }
   else if (data.type === 'createRoom') {
    if (!repo) { throw new Error('Open a project folder before creating a room.'); }
    const room = createRoom(data.name, repo, { id: serverUserId, name: name() });
    const result = await request('/rooms', { name: room.name, repository: repo.name });
    shared.rooms.push(result.room); shared.active = result.room.id;
    await context.workspaceState.update(`codejam.active.nexconn.${apiUrl()}`, shared.active);
    try { await ensureChat(); await loadHistory(); } catch (error) { connection = (error as Error).message; await notice(webview, connection); }
    await broadcast();
   }
   else if (data.type === 'joinRoom') {
    if (typeof data.invite !== 'string' || data.invite.length > 200) { throw new Error('Paste a valid invitation code.'); }
    const result = await request('/rooms/join', { invite: data.invite.trim() });
    shared.active = result.room.id;
    await context.workspaceState.update(`codejam.active.nexconn.${apiUrl()}`, shared.active);
    await refresh();
   }
   else if (data.type === 'switchRoom') {
    if (!shared.rooms.some(r => r.id === data.id)) { throw new Error('Room not found.'); }
    shared.active = data.id as string;
    await context.workspaceState.update(`codejam.active.nexconn.${apiUrl()}`, shared.active);
    if (!loaded.has(shared.active)) { try { await loadHistory(); } catch (error) { connection = (error as Error).message; await notice(webview, connection); } }
    await broadcast();
   }
   else if (data.type === 'loadOlder') { await loadHistory(true); await broadcast(); }
   else if (data.type === 'send') {
    const room = shared.rooms.find(r => r.id === data.roomId);
    if (!room?.channelId || !operation) { throw new Error('Choose a Nexconn room before sending.'); }
    const message = createMessage(data, { id: serverUserId, name: name() }, room);
    await ensureChat();
    // A retry can recover a message already acknowledged by Nexconn via live delivery/history.
    const existing = room.messages.find(m => m.clientId === operation && m.userId === serverUserId);
    if (!existing) {
     const result = await sdk('send', { channelId: room.channelId, text: message.text, attachment: message.attachment, replyTo: message.replyTo, clientId: operation });
     applyMessages([result]);
    }
    await broadcast();
   }
   else if (data.type === 'copyInvite') {
    const room = activeRoom(); if (!room?.invite) { throw new Error('Choose a room first.'); }
    await vscode.env.clipboard.writeText(room.invite);
    await notice(webview, 'Invitation code copied. Your teammate must use the same CodeJam backend.');
   }
   else if (data.type === 'selection') {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.selection.isEmpty || !repo) { throw new Error('Select a few lines in a project file, then attach them.'); }
    const relative = path.relative(repo.root, editor.document.uri.fsPath);
    if (relative.startsWith('..') || path.isAbsolute(relative) || editor.document.uri.scheme !== 'file') { throw new Error('Select code inside the detected repository.'); }
    if (/(^|[\\/])(\.env(?:\..*)?|.*\.(?:pem|key))$/i.test(relative)) { throw new Error('Secret and environment files cannot be shared.'); }
    const code = editor.document.getText(editor.selection);
    if (code.length > 12000) { throw new Error('Select fewer than 12,000 characters.'); }
    await webview.postMessage({ type: 'selection', attachment: { path: relative.replace(/\\/g, '/'), line: editor.selection.start.line + 1, endLine: editor.selection.end.character === 0 ? Math.max(editor.selection.start.line + 1, editor.selection.end.line) : editor.selection.end.line + 1, code, branch: repo.branch, commit: repo.commit } });
   }
   else if (data.type === 'openFile') {
    const message = activeRoom()?.messages.find(m => m.id === data.id);
    if (!message?.attachment || !repo) { throw new Error('Code reference not found.'); }
    const a = message.attachment, root = await realpath(repo.root), target = await realpath(path.resolve(root, a.path));
    const relative = path.relative(root, target);
    if (relative.startsWith('..') || path.isAbsolute(relative)) { throw new Error('This file is outside the linked repository.'); }
    if (a.commit !== repo.commit) { await notice(webview, 'Your checkout differs from the shared revision. The chat keeps the original excerpt.'); }
    const doc = await vscode.workspace.openTextDocument(target);
    const line = Math.max(0, Math.min(doc.lineCount - 1, a.line - 1));
    await vscode.window.showTextDocument(doc, { selection: new vscode.Range(line, 0, line, 0) });
   }
   if (operation) { await webview.postMessage({ type: 'result', operation, ok: true }); }
  } catch (error) {
   await notice(webview, (error as Error).message);
   if (operation) { await webview.postMessage({ type: 'result', operation, ok: false }); }
  }
 }
 function release(webview: vscode.Webview) {
  views.delete(webview);
  readyViews.delete(webview);
  for (const [id, pending] of rpc) { if (pending.owner === webview) { clearTimeout(pending.timer); pending.reject(new Error('The Nexconn client view closed. Retry from the other CodeJam view.')); rpc.delete(id); } }
  if (sdkOwner === webview) { sdkOwner = [...readyViews][0]; sdkConnected = false; loaded.clear(); if (sdkOwner) { queue = queue.then(refresh); } }
 }
 const setup = (webview: vscode.Webview) => {
  views.add(webview);
  webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')] };
  const resource = (file: string) => webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', file));
  const nonce = randomBytes(16).toString('hex');
  // Nexconn supplies regional navigation and WebSocket hosts dynamically in its token.
  webview.html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; connect-src https: wss:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';"><link rel="stylesheet" href="${resource('style.css')}"><title>CodeJam</title></head><body><div id="app"><p>Connecting to Nexconn…</p></div><script nonce="${nonce}" src="${resource('nexconn.js')}"></script><script nonce="${nonce}" src="${resource('app.js')}"></script></body></html>`;
  context.subscriptions.push(webview.onDidReceiveMessage(input => {
   // Resolve SDK RPCs immediately: the command queue may be awaiting this result.
   if (input?.type === 'sdkResult') {
    const pending = rpc.get(input.requestId);
    if (pending?.owner === webview) { clearTimeout(pending.timer); rpc.delete(input.requestId); if (input.ok) { pending.resolve(input.data); } else { pending.reject(new Error(String(input.error || 'Nexconn SDK operation failed.'))); } }
   } else if (input?.type === 'sdkMessages' && sdkOwner === webview) { applyMessages(input.messages); void broadcast(); }
   else if (input?.type === 'sdkStatus' && sdkOwner === webview) {
    const wasConnected = sdkConnected; sdkConnected = input.connected === true;
    connection = sdkConnected ? 'Connected to Nexconn' : `Nexconn reconnecting${input.code ? ` (code ${input.code})` : ''}…`;
    if (!wasConnected && sdkConnected) { loaded.clear(); queue = queue.then(refresh); }
    void broadcast();
   } else { queue = queue.then(() => handle(webview, input)).catch(() => undefined); }
  }));
 };
 context.subscriptions.push(vscode.window.registerWebviewViewProvider('codejam.workspace', {
  resolveWebviewView(view) { setup(view.webview); view.onDidDispose(() => release(view.webview)); }
 }, { webviewOptions: { retainContextWhenHidden: true } }));
 context.subscriptions.push(vscode.commands.registerCommand('codejam.open', () => vscode.commands.executeCommand('codejam.workspace.focus')));
 context.subscriptions.push(vscode.commands.registerCommand('codejam.resetSession', async () => {
  queue = queue.then(async () => {
   if (sdkOwner) { try { await sdk('disconnect'); } catch { /* View may be closed. */ } }
   await context.secrets.delete(`codejam.session.nexconn.${apiUrl()}`); shared = { rooms: [] }; loaded.clear(); sdkConnected = false; await refresh();
  });
  await vscode.window.showInformationMessage('CodeJam session reset. Rejoin shared rooms with their invitation codes.');
 }));
 context.subscriptions.push(vscode.commands.registerCommand('codejam.openPanel', () => {
  const panel = vscode.window.createWebviewPanel('codejam.workspacePanel', 'CodeJam', vscode.ViewColumn.One, { enableScripts: true, retainContextWhenHidden: true });
  setup(panel.webview); panel.onDidDispose(() => release(panel.webview));
 }));
 context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(() => { queue = queue.then(refresh); }));
 context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
  if (e.affectsConfiguration('codejam')) { queue = queue.then(async () => {
   if (sdkOwner) { try { await sdk('disconnect'); } catch { /* Reconnect below. */ } }
   shared = { rooms: [] }; loaded.clear(); sdkConnected = false; await refresh();
  }); }
 }));
 const timer = setInterval(() => { if (views.size && !refreshing) { queue = queue.then(refresh).catch(() => undefined); } }, 10000);
 context.subscriptions.push({ dispose: () => { clearInterval(timer); for (const pending of rpc.values()) { clearTimeout(pending.timer); pending.reject(new Error('CodeJam deactivated.')); } } });
}
export function deactivate() {}
