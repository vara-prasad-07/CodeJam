import * as vscode from 'vscode';
import { randomBytes, randomUUID } from 'node:crypto';
import * as path from 'node:path';
import { realpath } from 'node:fs/promises';
import { detectRepository, readGitDiff, Repository } from './repository';
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
 let account: {id:string; name:string; email?:string; isGuest?:boolean} | undefined, needsAuth = false, aiConfigured = false;
 let pendingAttachment: unknown;
 const contexts = new Map<string, {roomId:string; context:unknown}>();
 const snapshots = new Map<string, string>();
 const linked = () => { const room = activeRoom(); return Boolean(room && repo && ((!room.repositoryIdentity || room.repositoryIdentity === repo.identity) || context.workspaceState.get<Record<string,string>>('codejam.links', {})[repo.root] === room.id)); };
 const config = () => vscode.workspace.getConfiguration('codejam');
 const apiUrl = () => config().get<string>('apiUrl', 'https://codejam-vdmp.onrender.com').trim().replace(/\/$/, '');
 const browserUrl = () => { const url = new URL(apiUrl()); if (url.hostname === '127.0.0.1') { url.hostname = 'localhost'; } return url.origin; };
 const name = () => config().get<string>('displayName', '').trim() || 'Developer';
 const snapshot = () => ({ type: 'state', ...shared, repo, mode: 'nexconn', connection, connected: sdkConnected, userId: serverUserId, displayName: account?.name || name(), user: account, authenticated: Boolean(account) && !needsAuth, aiConfigured, linked: linked() });
 const broadcast = async () => { await Promise.all([...views].map(v => v.postMessage(snapshot()))); };
 const notice = (webview: vscode.Webview, text: string) => webview.postMessage({ type: 'notice', text });
 const activeRoom = () => shared.rooms.find(r => r.id === shared.active);

 async function request(route: string, body?: unknown): Promise<any> {
  const base = apiUrl();
  let url: URL;
  try { url = new URL(base); } catch { throw new Error('Set codejam.apiUrl to https://codejam-vdmp.onrender.com or your CodeJam backend URL.'); }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) { throw new Error('Use HTTPS for a remote server, or HTTP on localhost.'); }
  const secretKey = `codejam.session.nexconn.${base}`;
  let token = await context.secrets.get(secretKey);
  const perform = async (target: string, payload?: unknown, bearer?: string) => {
   let response: Response;
   try { response = await fetch(base + target, { method: payload === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) }, body: payload === undefined ? undefined : JSON.stringify(payload), signal: AbortSignal.timeout(route.endsWith('/draft') ? 60000 : 20000) }); }
   catch { throw new Error('Cannot reach the CodeJam backend. The hosted service may be waking up. Wait a minute, check codejam.apiUrl, then retry.'); }
   const data = await response.json() as any;
   if (!response.ok) { if (response.status === 401) { needsAuth = true; } const error = new Error(data.error || `Room server returned ${response.status}.`) as Error & {status:number}; error.status = response.status; throw error; }
   return data;
  };
  if (!token && !route.startsWith('/auth/')) { needsAuth = true; throw new Error('Sign in with email/password or Google to continue.'); }

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
     clientId: typeof item.clientId === 'string' ? item.clientId : undefined, discussionId: typeof item.discussionId === 'string' ? item.discussionId : undefined, mentions: Array.isArray(item.mentions) ? item.mentions.filter((id:unknown) => typeof id === 'string').slice(0,50) : [], reviewedDraft: item.reviewedDraft === true };
    const index = r.messages.findIndex(m => m.id === message.id);
    if (index >= 0) { r.messages[index] = message; } else { r.messages.push(message); }
    r.messages.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id));
   } catch { /* Ignore malformed/unrecognized payloads from other clients. */ }
  }
 }
 async function loadHistory(older = false) {
  const r = activeRoom();
  if (!r?.channelId || !sdkConnected) { return; }
  // Repair existing rooms whose creator was saved locally but never joined at Nexconn.
  await request('/rooms/' + r.id + '/chat-membership', {});
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
    const result = await request('/rooms'); serverUserId = result.userId; account = result.user || {id: result.userId, name: name()}; needsAuth = false; aiConfigured = result.aiConfigured === true;
    const active = shared.active || context.workspaceState.get<string>(`codejam.active.nexconn.${apiUrl()}`);
    shared = { rooms: result.rooms.map((r: Room) => ({ ...r, messages: (shared.rooms.find(old => old.id === r.id)?.messages || []).map(m => ({ ...m, author: r.members.find(member => member.id === m.userId)?.name || m.author })), hasMore: shared.rooms.find(old => old.id === r.id)?.hasMore })), active: result.rooms.some((r: Room) => r.id === active) ? active : result.rooms[0]?.id };
    if (activeRoom()) { await refreshDetails(); const editor = vscode.window.activeTextEditor; const relative = editor && repo ? path.relative(repo.root, editor.document.uri.fsPath) : '..'; const focus = editor && !relative.startsWith('..') && !path.isAbsolute(relative) ? relative.replace(/\\/g,'/') + ':' + (editor.selection.active.line + 1) : 'Working in the project'; await request(`/rooms/${shared.active}/presence`, {focus}).catch(() => undefined); }
    await ensureChat();
    if (shared.active && !loaded.has(shared.active)) { await loadHistory(); }
    connection = sdkConnected ? 'Connected to Nexconn' : 'Waiting for the Nexconn SDK client';
   } catch (error) { connection = (error as Error).message; }
   await broadcast();
  } finally { refreshing = false; }
 }
 async function refreshDetails() {
  const r = activeRoom(); if (!r) { return; }
  const details = await request('/rooms/' + r.id + '/details'); Object.assign(r,details);
 }
 function findSource(id:string) { const r = activeRoom(); return r?.messages.find(m => m.id === id) || r?.discussions?.find(d => d.source.id === id)?.source || r?.pins?.find(p => p.source.id === id)?.source; }
 async function acceptSession(result:any) {
  if (sdkOwner && sdkConnected) { await sdk('disconnect'); } sdkConnected = false; loaded.clear(); contexts.clear(); shared = {rooms:[]};
  await context.secrets.store('codejam.session.nexconn.' + apiUrl(), result.token); account = result.user; serverUserId = result.user.id; needsAuth = false;
 }
 function captureSelection() {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.selection.isEmpty || !repo) { throw new Error('Select a few lines in a project file, then attach them.'); }
    const relative = path.relative(repo.root, editor.document.uri.fsPath);
    if (relative.startsWith('..') || path.isAbsolute(relative) || editor.document.uri.scheme !== 'file') { throw new Error('Select code inside the detected repository.'); }
    if (/(^|[\\/])(\.env(?:\..*)?|.*\.(?:pem|key))$/i.test(relative)) { throw new Error('Secret and environment files cannot be shared.'); }
    const code = editor.document.getText(editor.selection);
    if (code.length > 12000) { throw new Error('Select fewer than 12,000 characters.'); }
    return { path: relative.replace(/\\/g, '/'), line: editor.selection.start.line + 1, endLine: editor.selection.end.character === 0 ? Math.max(editor.selection.start.line + 1, editor.selection.end.line) : editor.selection.end.line + 1, code, branch: repo.branch, commit: repo.commit, repository: repo.identity };
 }
 async function handle(webview: vscode.Webview, input: unknown) {
  if (!input || typeof input !== 'object' || !('type' in input)) { return; }
  const data = input as Record<string, unknown>;
  const operation = typeof data.operation === 'string' ? data.operation : undefined;
  try {
   if (data.type === 'ready') { readyViews.add(webview); if (!sdkOwner) { sdkOwner = webview; } await refresh(); if (pendingAttachment) { await webview.postMessage({type:'selection',attachment:pendingAttachment}); pendingAttachment = undefined; } }
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
    const result = await request('/rooms', { name: room.name, repository: repo.name, repositoryIdentity: repo.identity });
    shared.rooms.push(result.room); shared.active = result.room.id;
    await context.workspaceState.update(`codejam.active.nexconn.${apiUrl()}`, shared.active);
    try { await ensureChat(); await loadHistory(); await refreshDetails(); } catch (error) { connection = (error as Error).message; await notice(webview, connection); }
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
    await refreshDetails(); contexts.clear();
    if (!loaded.has(shared.active)) { try { await loadHistory(); } catch (error) { connection = (error as Error).message; await notice(webview, connection); } }
    await broadcast();
   }
   else if (data.type === 'loadOlder') { await loadHistory(true); await broadcast(); }
   else if (data.type === 'send') {
    const room = shared.rooms.find(r => r.id === data.roomId);
    if (!room?.channelId || !operation) { throw new Error('Choose a Nexconn room before sending.'); }
    if (data.attachment && !linked()) { throw new Error('Link this checkout to the room before sharing code.'); }
    const allowedSources = [...room.messages, ...(room.discussions || []).map(d => d.source)];
    const message = createMessage(data, { id: serverUserId, name: account?.name || name() }, {...room, messages: allowedSources});
    const mentionIds = Array.isArray(data.mentions) ? data.mentions.filter(id => typeof id === 'string' && room.members.some(m => m.id === id)).slice(0,50) : [];
    if (data.discussionId && !room.discussions?.some(d => d.id === data.discussionId)) { throw new Error('Discussion not found.'); }
    await ensureChat();
    // A retry can recover a message already acknowledged by Nexconn via live delivery/history.
    const existing = room.messages.find(m => m.clientId === operation && m.userId === serverUserId);
    if (!existing) {
     const result = await sdk('send', { channelId: room.channelId, text: message.text, attachment: message.attachment, replyTo: message.replyTo, clientId: operation, discussionId: data.discussionId, mentions: mentionIds, reviewedDraft: data.reviewedDraft === true });
     applyMessages([result]);
    }
    await broadcast();
   }
   else if (data.type === 'signIn') {
    const result = await request('/auth/password', {mode:data.mode,email:data.email,password:data.password,name:data.name || name()});
    await acceptSession(result); await refresh();
   }
   else if (data.type === 'googleSignIn') {
    const start = await request('/auth/browser/start', {});
    await vscode.env.openExternal(vscode.Uri.parse(browserUrl() + '/signin#' + start.ticket));
    let result; const deadline = Date.now() + 180000;
    while (Date.now() < deadline) { await new Promise(resolve => setTimeout(resolve,1500)); result = await request('/auth/browser/claim', {id:start.id,proof:start.proof}); if (!result.pending) { break; } }
    if (!result || result.pending) { throw new Error('Google sign-in timed out. Try again.'); }
    await acceptSession(result); await refresh();
   }
   else if (data.type === 'signOut') {
    await request('/auth/logout', {}); if (sdkOwner) { await sdk('disconnect'); }
    await context.secrets.delete('codejam.session.nexconn.' + apiUrl()); shared = {rooms:[]}; account = undefined; serverUserId = ''; needsAuth = true; sdkConnected = false; loaded.clear(); await broadcast();
   }
   else if (data.type === 'linkRoom') {
    if (!repo || !activeRoom()) { throw new Error('Open a project and choose a room first.'); }
    const links = context.workspaceState.get<Record<string,string>>('codejam.links', {}); links[repo.root] = shared.active!;
    await context.workspaceState.update('codejam.links',links); await broadcast();
   }
   else if (data.type === 'createDiscussion') {
    const source = findSource(String(data.id)); if (!source) { throw new Error('Choose a message for the discussion.'); }
    const result = await request('/rooms/' + shared.active + '/discussions',{source,title:data.title}); await refreshDetails(); await broadcast(); await webview.postMessage({type:'discussionCreated',id:result.discussion.id});
   }
   else if (data.type === 'resolveDiscussion') {
    await request('/rooms/' + shared.active + '/discussions/' + encodeURIComponent(String(data.id)),{status:data.status}); await refreshDetails(); await broadcast();
   }
   else if (data.type === 'pin') {
    const source = findSource(String(data.id)); if (!source) { throw new Error('Message not found.'); }
    await request('/rooms/' + shared.active + '/pins',{source,title:data.title,text:data.text,discussionId:data.discussionId}); await refreshDetails(); await broadcast();
   }
   else if (data.type === 'unpin') { await request('/rooms/' + shared.active + '/pins/' + encodeURIComponent(String(data.id)),{}); await refreshDetails(); await broadcast(); }
   else if (data.type === 'reaction') { await request('/rooms/' + shared.active + '/reactions',{messageId:data.id,emoji:data.emoji}); await refreshDetails(); await broadcast(); }
   else if (data.type === 'renewInvite') { const result = await request('/rooms/' + shared.active + '/invite',{}); Object.assign(activeRoom()!,result.room,{messages:activeRoom()!.messages}); await broadcast(); }
   else if (data.type === 'prepareContext') {
    const r = activeRoom(); if (!r) { throw new Error('Choose a room first.'); }
    const code = data.includeCode ? data.attachment || (data.sourceId ? findSource(String(data.sourceId))?.attachment : undefined) : null;
    const messages = data.includeMessages ? r.messages.filter(m => !data.discussionId || m.discussionId === data.discussionId || m.id === r.discussions?.find(d => d.id === data.discussionId)?.source.id).slice(-20).map(m => ({author:m.author,text:m.text})) : [];
    const contextData = {instruction:data.instruction,repository:repo?.identity || r.repositoryIdentity,messages,code,diff:data.includeDiff && repo ? await readGitDiff(repo.root) : ''};
    const contextId = randomUUID(); contexts.set(contextId,{roomId:r.id,context:contextData}); if (contexts.size > 20) { contexts.delete(contexts.keys().next().value!); } await webview.postMessage({type:'contextPreview',context:contextData,contextId});
   }
   else if (data.type === 'generateDraft') {
    const prepared = contexts.get(String(data.contextId)); if (!prepared || prepared.roomId !== shared.active) { throw new Error('Preview the context for this room first.'); }
    const result = await request('/rooms/' + shared.active + '/draft',{context:prepared.context}); await webview.postMessage({type:'draft',text:result.text,model:result.model});
   }
   else if (data.type === 'openCall') { const result = await request('/rooms/' + shared.active + '/call-ticket',{}); await vscode.env.openExternal(vscode.Uri.parse(browserUrl() + '/call#' + result.ticket)); }
   else if (data.type === 'callControl') { await request('/rooms/' + shared.active + '/call/control',{action:data.action}); await notice(webview,'Control sent to your call browser.'); }
   else if (data.type === 'copyInvite') {
    const room = activeRoom(); if (!room?.invite) { throw new Error('Choose a room first.'); }
    await vscode.env.clipboard.writeText(room.invite);
    await notice(webview, 'Invitation code copied. Your teammate must use the same CodeJam backend.');
   }
   else if (data.type === 'selection') {
    await webview.postMessage({type:'selection',attachment:captureSelection()});
   }
   else if (data.type === 'openFile' || data.type === 'showDiff' || data.type === 'inspectReference') {
    const message = findSource(String(data.id));
    if (!message?.attachment || !repo) { throw new Error('Code reference not found.'); }
    const a = message.attachment, root = await realpath(repo.root), target = await realpath(path.resolve(root, a.path));
    const relative = path.relative(root, target);
    if (relative.startsWith('..') || path.isAbsolute(relative)) { throw new Error('This file is outside the linked repository.'); }
    if (!linked()) { throw new Error('Confirm the local repository link before opening shared code.'); }
    if (data.type === 'inspectReference') { const document = await vscode.workspace.openTextDocument(target); const local = document.getText(new vscode.Range(Math.min(a.line-1, document.lineCount-1), 0, Math.min(a.endLine-1, document.lineCount-1), document.lineAt(Math.min(a.endLine-1, document.lineCount-1)).text.length)); await webview.postMessage({type:'referenceStatus',id:message.id,differs:a.commit!==repo.commit || local.replace(/\r\n/g,'\n').trimEnd()!==a.code.replace(/\r\n/g,'\n').trimEnd()}); return; }
    if (data.type === 'showDiff') { const uri = vscode.Uri.parse('codejam-snapshot:' + randomUUID()); if (snapshots.size >= 100) { snapshots.delete(snapshots.keys().next().value!); } snapshots.set(uri.toString(), '\n'.repeat(Math.min(a.line-1,100000)) + a.code); await vscode.commands.executeCommand('vscode.diff', uri, vscode.Uri.file(target), a.path + ' ? shared excerpt ? working copy'); return; }
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
 context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider('codejam-snapshot', {provideTextDocumentContent: uri => snapshots.get(uri.toString()) || 'Shared revision unavailable.'}));
 context.subscriptions.push(vscode.commands.registerCommand('codejam.shareSelection', async () => {
  const editor = vscode.window.activeTextEditor; if (!editor || editor.selection.isEmpty) { await vscode.window.showInformationMessage('Select code in an editor first.'); return; }
  if (!repo) { const folder = vscode.workspace.getWorkspaceFolder(editor.document.uri); if (folder) { repo = await detectRepository(folder.uri.fsPath); } }
  const first = [...readyViews][0]; if (first) { await handle(first,{type:'selection'}); await vscode.commands.executeCommand('codejam.workspace.focus'); } else { pendingAttachment = captureSelection(); await vscode.commands.executeCommand('codejam.workspace.focus'); }
 }));
 context.subscriptions.push(vscode.commands.registerCommand('codejam.open', () => vscode.commands.executeCommand('codejam.workspace.focus')));
 context.subscriptions.push(vscode.commands.registerCommand('codejam.resetSession', async () => {
  queue = queue.then(async () => {
   if (sdkOwner) { try { await sdk('disconnect'); } catch { /* View may be closed. */ } }
   await context.secrets.delete(`codejam.session.nexconn.${apiUrl()}`); shared = { rooms: [] }; loaded.clear(); sdkConnected = false; await refresh();
  });
  await vscode.window.showInformationMessage('CodeJam session reset. Sign in again to restore your rooms.');
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
