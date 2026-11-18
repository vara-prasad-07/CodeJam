const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {spawn} = require('node:child_process');

const extensionPath = path.resolve(__dirname, '..');
const projectPath = path.resolve(extensionPath, '..');
const profilePath = path.join(os.tmpdir(), 'codejam-person-2-debug');
const candidates = [
 path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Microsoft VS Code', 'Code.exe'),
 path.join(process.env.ProgramFiles || '', 'Microsoft VS Code', 'Code.exe'),
];
const executable = candidates.find(candidate => fs.existsSync(candidate));
if (!executable) { throw new Error('VS Code executable not found.'); }
if (!fs.existsSync(path.join(extensionPath, 'dist', 'extension.js'))) { throw new Error('Run npm run compile in codejam first.'); }
const settingsPath = path.join(profilePath, 'User', 'settings.json');
fs.mkdirSync(path.dirname(settingsPath), {recursive:true});
if (!fs.existsSync(settingsPath)) {
 fs.writeFileSync(settingsPath, JSON.stringify({
  'codejam.displayName':'Person 2',
  'codejam.apiUrl':'http://127.0.0.1:3000',
  'window.title':'CodeJam - Person 2',
  'workbench.startupEditor':'none',
 }, null, 2));
}
const launchEnv = {...process.env};
for (const key of Object.keys(launchEnv)) {
 if (/^VSCODE_/i.test(key) || /^ELECTRON_RUN_AS_NODE$/i.test(key) || /^NODE_OPTIONS$/i.test(key)) { delete launchEnv[key]; }
}
const child = spawn(executable, [
 '--new-window', `--user-data-dir=${profilePath}`,
 `--extensionDevelopmentPath=${extensionPath}`, '--disable-extensions', projectPath,
], {env:launchEnv, cwd:projectPath, detached:true, stdio:'ignore', windowsHide:false});
child.on('error', error => { console.error('Could not start Person 2:',error.message); process.exitCode=1; });
child.on('spawn', () => { console.log(`Started independent Person 2 instance (PID ${child.pid}).`); child.unref(); });
