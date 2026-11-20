import { randomUUID } from 'node:crypto';
import type { Repository } from './repository';
import type { VoiceAttachment } from './voice';
export interface Attachment { path: string; line: number; endLine: number; code: string; branch: string; commit: string; repository?: string }
export interface ChatMessage { id: string; author: string; userId: string; text: string; createdAt: string; attachment?: Attachment; voice?: VoiceAttachment; replyTo?: string; clientId?: string; discussionId?: string; mentions?: string[]; reviewedDraft?: boolean; agent?: {question:string; model:string} }
export interface Room { id: string; ownerId?: string; channelId?: string; name: string; repository: string; createdAt: string; messages: ChatMessage[]; members: { id: string; name: string }[]; invite?: string; hasMore?: boolean; repositoryIdentity?: string; inviteExpiresAt?: number; pins?: Decision[]; discussions?: Discussion[]; reactions?: Reaction[]; presence?: Presence[]; call?: CallState | null }
export interface Decision { id: string; title: string; text: string; source: ChatMessage; discussionId?: string; createdAt: string; pinnedBy: string }
export interface Discussion { id: string; title: string; source: ChatMessage; status: 'open' | 'resolved'; createdAt: string; updatedAt: string; resolvedBy?: string }
export interface Reaction { id: string; values: Record<string, string[]> }
export interface Presence { id: string; name: string; focus: string; lastSeen: number }
export interface CallState { callId: string; startedAt: string; hostId: string; participants: { id: string; name: string; muted: boolean; status: string; lastSeen: number }[] }
export interface LocalState { rooms: Room[]; active?: string }
export function createRoom(name: unknown, repo: Repository, user: { id: string; name: string }): Room {
 if (typeof name !== 'string' || !name.trim() || name.trim().length > 64) { throw new Error('Enter a room name of 1–64 characters.'); }
 return { id: randomUUID(), ownerId: user.id, name: name.trim(), repository: repo.name, createdAt: new Date().toISOString(), messages: [], members: [user] };
}
export function createMessage(input: Record<string, unknown>, user: { id: string; name: string }, room: Room): ChatMessage {
 const text = typeof input.text === 'string' ? input.text.trim() : '';
 if (text.length > 12000) { throw new Error('Messages can contain at most 12,000 characters.'); }
 let attachment: Attachment | undefined;
 if (input.attachment) {
  const a = input.attachment as Attachment;
  if (typeof a.path !== 'string' || /(^[\\/]|^[a-z]:|(^|[\\/])\.\.([\\/]|$))/i.test(a.path) || typeof a.code !== 'string' || a.code.length > 12000 || !Number.isInteger(a.line) || !Number.isInteger(a.endLine) || a.line < 1 || a.endLine < a.line || typeof a.branch !== 'string' || typeof a.commit !== 'string') { throw new Error('Invalid code attachment.'); }
  attachment = { path: a.path, code: a.code, line: a.line, endLine: a.endLine, branch: a.branch, commit: a.commit, repository: typeof a.repository === 'string' ? a.repository.slice(0, 500) : undefined };
 }
 let voice: VoiceAttachment | undefined;
 if (input.voice) {
  const value = input.voice as VoiceAttachment;
  let url: URL; try { url = new URL(value.url); } catch { throw new Error('Invalid voice message URL.'); }
  if (url.protocol !== 'https:' || url.username || url.password || value.url.length > 4096 || !Number.isFinite(value.duration) || value.duration < 1 || value.duration > 60 || value.mimeType !== 'audio/wav') { throw new Error('Invalid voice message.'); }
  voice = {url:url.href,duration:value.duration,mimeType:value.mimeType};
 }
 if (!text && !attachment && !voice) { throw new Error('Write a message or attach selected code.'); }
 const replyTo = typeof input.replyTo === 'string' ? input.replyTo : undefined;
 if (replyTo && !room.messages.some(m => m.id === replyTo)) { throw new Error('The original message is no longer available.'); }
 return { id: randomUUID(), author: user.name, userId: user.id, text, createdAt: new Date().toISOString(), attachment, ...(voice?{voice}:{}), replyTo };
}
