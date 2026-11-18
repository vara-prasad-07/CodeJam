const {test}=require('node:test');
const assert=require('node:assert/strict');
const {mkdtemp,writeFile,mkdir,rm}=require('node:fs/promises');
const {execFileSync}=require('node:child_process');
const path=require('node:path');
const os=require('node:os');
const {detectRepository}=require('../out/repository.js');
const {createRoom,createMessage}=require('../out/model.js');

test('Git detection reads nested repositories, latest commit, dirty and detached states',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'codejam-git-'));
 t.after(()=>rm(dir,{recursive:true,force:true}));
 const git=(...args)=>execFileSync('git',['-C',dir,...args],{windowsHide:true,stdio:'pipe'}).toString().trim();
 git('init','-b','main');git('config','user.name','CodeJam Test');git('config','user.email','codejam@example.invalid');
 await mkdir(path.join(dir,'app'));
 await writeFile(path.join(dir,'app','package.json'),JSON.stringify({devDependencies:{typescript:'*'}}));
 const empty=await detectRepository(path.join(dir,'app'));
 assert.equal(empty.detected,true);assert.equal(empty.commit,'');assert.equal(empty.stack,'TypeScript · Node.js');
 git('add','.');git('commit','-m','Initial room base');
 const repo=await detectRepository(path.join(dir,'app'));
 assert.equal(repo.branch,'main');assert.equal(repo.summary,'Initial room base');assert.equal(repo.author,'CodeJam Test');assert.equal(repo.dirty,false);assert.equal(repo.commit,git('rev-parse','--short','HEAD'));
 await writeFile(path.join(dir,'app','file.ts'),'export const value = 1;');
 assert.equal((await detectRepository(dir)).dirty,true);
 git('checkout','--detach','HEAD');assert.equal((await detectRepository(dir)).branch,'Detached HEAD');
});

test('non-Git folder stays usable and malformed chat context is rejected',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'codejam-plain-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const repo=await detectRepository(dir);assert.equal(repo.detected,false);
 const user={id:'me',name:'Vara'};
 assert.throws(()=>createRoom(' ',repo,user));
 const room=createRoom('Project',repo,user);
 assert.throws(()=>createMessage({text:'  '},user,room));
 assert.throws(()=>createMessage({text:'hi',replyTo:'absent'},user,room));
 assert.throws(()=>createMessage({attachment:{path:'../.env',code:'secret',line:1,endLine:1,branch:'main',commit:''}},user,room));
 const first=createMessage({text:'hello'},user,room);room.messages.push(first);
 assert.equal(createMessage({text:'reply',replyTo:first.id},user,room).replyTo,first.id);
});
