import { buildAgentContext, agentPermissions } from './agentContext';
import type { Attachment, Room } from './model';

export interface AgentAnswer { id:string; roomId:string; repoRoot:string; userId:string; discussionId?:string; question:string; text:string; model:string }
interface Destination { room?:Room; repoRoot:string; userId:string; repository:string; hasRepository:boolean; linked:boolean; authenticated:boolean }
interface AgentHost<View> {
 destination():Destination;
 readCode(input:Record<string,unknown>):Attachment | undefined;
 readDiff(root:string):Promise<string>;
 request(roomId:string,context:unknown,signal:AbortSignal):Promise<any>;
 publish(answer:AgentAnswer,signal?:AbortSignal):Promise<void>;
 post(view:View,data:unknown):unknown;
}
export class AgentController<View> {
 private jobs = new Map<View,AbortController>();
 private answers = new Map<View,AgentAnswer>();
 private operations = new Map<View,string>();
 constructor(private readonly host:AgentHost<View>) {}
 cancel(view?:View) {
  for (const [owner,job] of this.jobs) { if (view === undefined || owner === view) { job.abort(); this.jobs.delete(owner); void this.host.post(owner,{type:'agentCanceled',operation:this.operations.get(owner)}); this.operations.delete(owner); } }
  if (view === undefined) { this.answers.clear(); } else { this.answers.delete(view); }
 }
 private current(answer:Pick<AgentAnswer,'roomId'|'repoRoot'|'userId'>) {
  const d=this.host.destination();return d.authenticated && d.room?.id===answer.roomId && d.repoRoot===answer.repoRoot && d.userId===answer.userId;
 }
 async share(view:View,id:unknown) {
  const answer=this.answers.get(view);
  if (!answer || answer.id !== id || !this.current(answer)) { throw new Error('This private answer is no longer available here. Ask Agent again.'); }
  await this.host.publish(answer);
 }
 async ask(view:View,input:Record<string,unknown>) {
  if (this.jobs.has(view)) { return; }
  const operation=String(input.operation || ''),controller=new AbortController(),destination=this.host.destination();
  this.jobs.set(view,controller);this.operations.set(view,operation);this.answers.delete(view);
  const {room,repoRoot,userId}=destination;
  const respond=(data:Record<string,unknown>)=>this.host.post(view,{...data,type:'agentResponse',operation,roomId:room?.id});
  try {
   if (!operation || !room || room.id !== input.roomId || !destination.authenticated) { throw new Error('Sign in and choose a room before asking Agent.'); }
   if (typeof input.instruction !== 'string' || !input.instruction.trim() || input.instruction.length > 2000) { throw new Error('Enter a question or request (up to 2,000 characters).'); }
   const permissions=agentPermissions(input.permissions);
   if ((permissions.code || permissions.diff) && !destination.linked) { throw new Error('Link this checkout to the room before allowing local code or Git diff.'); }
   const target={roomId:room.id,repoRoot,userId};
   const context=await buildAgentContext(input,room,destination.repository,()=>{
    if (controller.signal.aborted || !this.current(target)) { throw new Error('The original destination changed. Ask Agent again here.'); }
    return this.host.readCode(input);
   },()=>this.host.readDiff(repoRoot),destination.hasRepository);
   if (controller.signal.aborted || !this.current(target)) { return; }
   const result=await this.host.request(room.id,context,controller.signal);
   if (controller.signal.aborted || !this.current(target)) { return; }
   if (!['answer','needs_context'].includes(result.status) || typeof result.text !== 'string' || !result.text.trim() || result.text.length > 12000) { throw new Error('The backend returned an invalid Agent response. Update the backend or retry.'); }
   if (result.status==='needs_context') { await respond({status:result.status,text:result.text,missingSources:result.missingSources});return; }
   const answer:AgentAnswer={id:operation,...target,discussionId:typeof input.discussionId==='string'?input.discussionId:undefined,question:context.instruction,text:result.text,model:String(result.model || 'Gemini').slice(0,100)};
   this.answers.set(view,answer);
   if (!controller.signal.aborted && this.current(target)) { await respond({status:'answer',text:answer.text,model:answer.model,answerId:answer.id,shared:false}); }
  } catch(error) {
   if (!controller.signal.aborted) { await respond({status:'error',text:(error as Error).message}); }
  } finally { if (this.jobs.get(view)===controller) { this.jobs.delete(view); this.operations.delete(view); } }
 }
}
