import type {Attachment, ChatMessage, Room} from './model';

// Build the exact snapshot shown in the preview. Read a local diff only if opted in.
export async function buildAIContext(input: Record<string, unknown>, room: Room, repository = '', readDiff = async () => '') {
 if (typeof input.instruction !== 'string' || !input.instruction.trim() || input.instruction.length > 2000) {
  throw new Error('Enter a question or request (up to 2,000 characters).');
 }
 const discussion = input.discussionId ? room.discussions?.find(d => d.id === input.discussionId) : undefined;
 if (input.discussionId && !discussion) { throw new Error('This discussion is no longer available. Reopen Ask AI from the room.'); }
 const sources = [...room.messages, ...(room.discussions || []).map(d => d.source), ...(room.pins || []).map(p => p.source)];
 const source = input.sourceId ? sources.find(m => m.id === input.sourceId) : undefined;
 if (input.sourceId && !source) { throw new Error('This message is no longer available. Reopen Ask AI from the room.'); }
 const warnings: string[] = [];
 let messages: ChatMessage[] = [];
 if (input.includeMessages === true) {
  if (discussion) {
   const replies = room.messages.filter(m => m.id !== discussion.source.id && (m.discussionId === discussion.id || m.replyTo === discussion.source.id));
   messages = [discussion.source, ...replies.slice(-19)];
  } else { messages = source ? [source] : room.messages.filter(m => !m.discussionId).slice(-20); }
  messages = messages.filter(m => m.text?.trim());
  if (!messages.length) { warnings.push('No message text is available to include.'); }
 }
 const candidate = input.includeCode === true ? (input.attachment as Attachment | undefined) || source?.attachment : undefined;
 const code = candidate && typeof candidate.code === 'string' && candidate.code.trim() ? candidate : null;
 if (input.includeCode === true && !code) { warnings.push('No attached or shared code is available to include.'); }
 const diff = input.includeDiff === true ? await readDiff() : '';
 if (input.includeDiff === true && !diff.trim()) { warnings.push('No local Git changes were found to include.'); }
 const context = {
  instruction: input.instruction.trim(),
  repository: messages.length || code || diff.trim() ? repository : '',
  messages: messages.map(m => ({author:m.author,text:m.text})),
  code,
  diff: diff.trim() ? diff : '',
 };
 return {context, warnings};
}
