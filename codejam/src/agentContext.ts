import { buildAIContext } from './aiContext';
import type { Attachment, Room } from './model';

export interface AgentPermissions { code: boolean; messages: boolean; diff: boolean }
export function agentPermissions(value: unknown): AgentPermissions {
 const p = value && typeof value === 'object' ? value as Record<string, unknown> : {};
 return {code:p.code === true,messages:p.messages === true,diff:p.diff === true};
}

// Permission to read a source is separate from whether that source is available.
export async function buildAgentContext(input: Record<string, unknown>, room: Room, repository: string,
 readSelection: () => Attachment | undefined, readDiff: () => Promise<string>, hasRepository: boolean) {
 const permissions = agentPermissions(input.permissions);
 // Reject stale references and invalid questions before touching local source data.
 await buildAIContext({...input,includeCode:false,includeMessages:false,includeDiff:false},room);
 const attachment = permissions.code ? readSelection() : undefined;
 const {context} = await buildAIContext({...input,attachment,includeCode:permissions.code,includeMessages:permissions.messages,includeDiff:permissions.diff && hasRepository}, room, repository, readDiff);
 const result={...context,permissions,availability:{code:permissions.code ? context.code ? 'included' : 'missing' : 'disabled',messages:permissions.messages ? context.messages.length ? 'included' : 'missing' : 'disabled',diff:permissions.diff ? hasRepository ? context.diff ? 'included' : 'empty' : 'missing' : 'disabled'}};
 if (Buffer.byteLength(JSON.stringify(result),'utf8') > 110000) { throw new Error('The enabled context is too large. Select a shorter excerpt or narrow the discussion and retry.'); }
 return result;
}
