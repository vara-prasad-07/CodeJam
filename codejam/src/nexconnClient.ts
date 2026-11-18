import { NCEngine, AreaCode, LogLevel, ConnectionStatus, ConnectionStatusHandler, MessageHandler, MessageType, Message, GroupChannel, GroupChannelIdentifier, BaseChannel, SendTextMessageParams, MessagesQuery, ChannelType, MentionedType } from '@nexconn/chat';
import type { Attachment } from './model';

type Host = { postMessage(data: unknown): void };
interface Session { appKey: string; token: string; userId: string; region: 'SG' | 'NA' | 'SA' }
interface SendInput { channelId: string; text: string; attachment?: Attachment; replyTo?: string; clientId: string; discussionId?: string; mentions?: string[]; reviewedDraft?: boolean }
export function startNexconnBridge(host: Host) {
 let initializedKey = '', connectedUser = '';
 const queries = new Map<string, MessagesQuery>();
 const sent = new Map<string, Promise<unknown>>();
 const normalize = (m: Message) => {
  if (m.messageType !== MessageType.TEXT || m.channelIdentifier.channelType !== ChannelType.GROUP) { return null; }
  let extra: Record<string, unknown> = {};
  try { const parsed = JSON.parse(m.content.extra || '{}'); if (parsed?.codejam === 1) { extra = parsed; } } catch { /* Ordinary Nexconn text. */ }
  return { id: m.messageId, channelId: m.channelIdentifier.channelId, channelType: m.channelIdentifier.channelType, userId: m.senderUserId, text: m.content.text || '', createdAt: new Date(m.sentTime).toISOString(), attachment: extra.attachment, replyTo: extra.replyTo, clientId: extra.clientId, discussionId: extra.discussionId, reviewedDraft: extra.reviewedDraft === true, mentions: m.content.mentionedInfo?.userIdList || [] };
 };
 const messages = (items: Message[]) => items.map(normalize).filter(Boolean);
 function initialize(session: Session) {
  if (initializedKey && initializedKey !== session.appKey) { throw new Error('The Nexconn application changed. Reload this VS Code window.'); }
  if (initializedKey) { return; }
  NCEngine.initialize({ appKey: session.appKey, areaCode: AreaCode[session.region], logLevel: LogLevel.ERROR });
  initializedKey = session.appKey;
  NCEngine.addConnectionStatusHandler('codejam', new ConnectionStatusHandler({ onConnectionStatusChanged({status, code}) {
   host.postMessage({ type: 'sdkStatus', connected: status === ConnectionStatus.CONNECTED, status, code });
  } }));
  NCEngine.addMessageHandler('codejam', new MessageHandler({ onMessageReceived(event) {
   host.postMessage({ type: 'sdkMessages', messages: messages(event.messages) });
  } }));
 }
 async function connect(session: Session) {
  initialize(session);
  if (connectedUser === session.userId && NCEngine.getConnectionStatus() === ConnectionStatus.CONNECTED) { return { userId: connectedUser }; }
  if (connectedUser) { await NCEngine.disconnect(); }
  const result = await NCEngine.connect({ token: session.token });
  if (!result.isOk || !result.data) { throw new Error(`Nexconn SDK connection failed (code ${result.code}). Check Chat access and region; retry to obtain a fresh token.`); }
  connectedUser = result.data.userId;
  return { userId: connectedUser };
 }
 async function history(channelId: string, older = false) {
  if (!connectedUser || NCEngine.getConnectionStatus() !== ConnectionStatus.CONNECTED) { throw new Error('Nexconn is disconnected. Reconnect before loading messages.'); }
  let query = queries.get(channelId);
  if (!older || !query) { query = BaseChannel.createMessagesQuery({ channelIdentifier: new GroupChannelIdentifier(channelId), pageSize: 50, isAscending: false }); queries.set(channelId, query); }
  const result = await query.loadNextPage();
  if (!result.isOk || !result.data) {
   const reason = result.code === 22406 ? 'Your Nexconn identity is not a member of this room. Click Reconnect to repair membership.' : 'Retry after checking Nexconn Chat service access and connection.';
   throw new Error(`Nexconn message history failed (code ${result.code}). ${reason}`);
  }
  return { messages: messages(result.data.data), hasMore: query.hasNext };
 }
 async function send(input: SendInput) {
  if (sent.has(input.clientId)) { return sent.get(input.clientId); }
  if (NCEngine.getConnectionStatus() !== ConnectionStatus.CONNECTED) { throw new Error('Nexconn is disconnected. Reconnect before sending.'); }
  const promise = (async () => {
   const result = await new GroupChannel(input.channelId).sendMessage(new SendTextMessageParams({ text: input.text || '[Shared code]', mentionedInfo: input.mentions?.length ? { type: MentionedType.USERS, userIdList: input.mentions } : undefined, extra: JSON.stringify({ codejam: 1, attachment: input.attachment, replyTo: input.replyTo, clientId: input.clientId, discussionId: input.discussionId, reviewedDraft: input.reviewedDraft }) }));
   if (!result.isOk || !result.data) { throw new Error(`Nexconn message send failed (code ${result.code}). Your draft is kept for retry.`); }
   return normalize(result.data);
  })();
  sent.set(input.clientId, promise);
  try { return await promise; } catch (error) { sent.delete(input.clientId); throw error; }
 }
 globalThis.addEventListener('message', async event => {
  const data = event.data;
  if (data?.type !== 'sdkCommand') { return; }
  try {
   let result;
   if (data.command === 'connect') { result = await connect(data.input); }
   else if (data.command === 'history') { result = await history(data.input.channelId, data.input.older); }
   else if (data.command === 'send') { result = await send(data.input); }
   else if (data.command === 'disconnect') { await NCEngine.disconnect(); connectedUser = ''; queries.clear(); sent.clear(); }
   else { throw new Error('Unsupported SDK command.'); }
   host.postMessage({ type: 'sdkResult', requestId: data.requestId, ok: true, data: result });
  } catch (error) {
   host.postMessage({ type: 'sdkResult', requestId: data.requestId, ok: false, error: (error as Error).message });
  }
 });
}
(globalThis as unknown as { startNexconnBridge: typeof startNexconnBridge }).startNexconnBridge = startNexconnBridge;
