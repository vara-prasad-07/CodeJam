import * as path from 'node:path';
import { realpath, stat } from 'node:fs/promises';
import type { Attachment } from './model';

// References are portable filenames, never file URIs, drive paths, or traversal.
export function referencePath(value: unknown): string {
 if (typeof value !== 'string' || !value.trim() || value.length > 1000 || /[\x00-\x1f\x7f:]/.test(value)) { throw new Error('Invalid code reference path.'); }
 const normalized = value.replace(/\\/g, '/');
 if (normalized.split('/').some(part => !part || part === '.' || part === '..' || /[ .]$/.test(part))) { throw new Error('Invalid code reference path.'); }
 return normalized;
}
export function isWithin(root: string, target: string): boolean {
 const relative = path.relative(root, target);
 return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}
export function checkoutKey(backend: string, userId: string, roomId: string): string { return JSON.stringify([backend, userId, roomId]); }
export function sameRepository(left?: string, right?: string): boolean {
 // A folder basename is not a repository identity; unrelated projects can share it.
 return Boolean(left && right && !left.startsWith('local:') && left === right);
}
export type ReferenceFile = {status: 'available'; target: string} | {status: 'missing' | 'outside' | 'invalid' | 'unreadable' | 'too-large'};
export async function resolveReferenceFile(root: string, filename: string): Promise<ReferenceFile> {
 let portable: string;
 try { portable = referencePath(filename); } catch { return {status:'invalid'}; }
 try {
  const actualRoot = await realpath(root), candidate = path.resolve(actualRoot, ...portable.split('/'));
  if (!isWithin(actualRoot, candidate)) { return {status:'outside'}; }
  const target = await realpath(candidate);
  if (!isWithin(actualRoot, target)) { return {status:'outside'}; }
  const info = await stat(target);
  if (!info.isFile()) { return {status:'missing'}; }
  if (info.size > 5 * 1024 * 1024) { return {status:'too-large'}; }
  return {status:'available', target};
 } catch (error) {
  return {status:['ENOENT','ENOTDIR'].includes((error as NodeJS.ErrnoException).code || '') ? 'missing' : 'unreadable'};
 }
}
export interface ExcerptMatch { status: 'matched'; line: number; character: number; endLine: number; endCharacter: number }
export function locateExcerpt(text: string, attachment: Pick<Attachment,'code'>): ExcerptMatch | {status: 'changed' | 'ambiguous'} {
 const local = text.replace(/\r\n?/g, '\n'), excerpt = attachment.code.replace(/\r\n?/g, '\n');
 if (!excerpt.trim() || local.length > 5 * 1024 * 1024) { return {status:'changed'}; }
 const offset = local.indexOf(excerpt);
 if (offset < 0) { return {status:'changed'}; }
 // Do not guess between identical functions, even if one is at the old line.
 if (local.indexOf(excerpt, offset + 1) >= 0) { return {status:'ambiguous'}; }
 const position = (index: number) => {
  const before = local.slice(0,index), last = before.lastIndexOf('\n');
  return {line:before.split('\n').length - 1, character:index - last - 1};
 };
 const start = position(offset), end = position(offset + excerpt.length);
 return {status:'matched', line:start.line, character:start.character, endLine:end.line, endCharacter:end.character};
}
