import { randomUUID } from 'node:crypto';
import type { Repository } from './repository';
export interface Attachment { path: string; line: number; endLine: number; code: string; branch: string; commit: string }
export interface ChatMessage { id: string; author: string; userId: string; text: string; createdAt: string; attachment?: Attachment; replyTo?: string; clientId?: string }
export interface Room { id: string; channelId?: string; name: string; repository: string; createdAt: string; messages: ChatMessage[]; members: { id: string; name: string }[]; invite?: string; hasMore?: boolean }
export interface LocalState { rooms: Room[]; active?: string }
export function createRoom(name: unknown, repo: Repository, user: { id: string; name: string }): Room {
 if (typeof name !== 'string' || !name.trim() || name.trim().length > 64) { throw new Error('Enter a room name of 1–64 characters.'); }
 return { id: randomUUID(), name: name.trim(), repository: repo.name, createdAt: new Date().toISOString(), messages: [], members: [user] };
}
export function createMessage(input: Record<string, unknown>, user: { id: string; name: string }, room: Room): ChatMessage {
 const text = typeof input.text === 'string' ? input.text.trim() : '';
 if (text.length > 12000) { throw new Error('Messages can contain at most 12,000 characters.'); }
 let attachment: Attachment | undefined;
 if (input.attachment) {
  const a = input.attachment as Attachment;
  if (typeof a.path !== 'string' || /(^[\\/]|^[a-z]:|(^|[\\/])\.\.([\\/]|$))/i.test(a.path) || typeof a.code !== 'string' || a.code.length > 12000 || !Number.isInteger(a.line) || !Number.isInteger(a.endLine) || a.line < 1 || a.endLine < a.line || typeof a.branch !== 'string' || typeof a.commit !== 'string') { throw new Error('Invalid code attachment.'); }
  attachment = { path: a.path, code: a.code, line: a.line, endLine: a.endLine, branch: a.branch, commit: a.commit };
 }
 if (!text && !attachment) { throw new Error('Write a message or attach selected code.'); }
 const replyTo = typeof input.replyTo === 'string' ? input.replyTo : undefined;
 if (replyTo && !room.messages.some(m => m.id === replyTo)) { throw new Error('The original message is no longer available.'); }
 return { id: randomUUID(), author: user.name, userId: user.id, text, createdAt: new Date().toISOString(), attachment, replyTo };
}
