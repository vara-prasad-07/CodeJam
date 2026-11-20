// Compile the local helper only. This never builds or packages the extension.
const {spawnSync} = require('node:child_process');
const {mkdirSync,writeFileSync,readFileSync,rmSync} = require('node:fs');
const {join,resolve} = require('node:path');
const {createHash} = require('node:crypto');
const arch = process.env.RECORDER_ARCH || process.arch;
const platform = process.platform;
const folder = resolve(__dirname,'../native/bin',`${platform}-${arch}`);
mkdirSync(folder,{recursive:true});
const file = join(folder,platform==='win32'?'recorder.exe':'recorder');
const cc = process.env.CC || (platform==='win32'?'cl':'cc');
const source = resolve(__dirname,'../native/recorder.c');
const msvc = /(^|[\\/])cl(?:\.exe)?$/i.test(cc);
const args = msvc ? ['/nologo','/O2','/MT','/std:c11','/D_CRT_SECURE_NO_WARNINGS',source,`/Fe:${file}`,`/Fo:${join(folder,'recorder.obj')}`] : ['-std=c99','-O2',source,'-o',file,...(platform==='linux'?['-lm','-ldl','-lpthread']:platform==='darwin'?['-lpthread','-lm']:['-DMA_NO_WASAPI','-DMA_NO_DSOUND','-static-libgcc','-lwinmm','-lole32','-lshell32'])];
const result = spawnSync(cc,args,{stdio:'inherit',shell:false,windowsHide:true});
if(result.error){console.error(`Cannot run ${cc}. Install a C compiler or run from the Visual Studio developer environment.`,result.error.message);process.exit(1);}
if(result.status!==0){process.exit(result.status||1);}
rmSync(join(folder,'recorder.obj'),{force:true});
writeFileSync(join(folder,'sha256.txt'),createHash('sha256').update(readFileSync(file)).digest('hex')+'\n');
console.log('Native recorder built:',file);
