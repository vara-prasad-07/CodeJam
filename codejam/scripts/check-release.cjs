const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const errors = [];
for (const name of ['README.md','CHANGELOG.md','LICENSE.txt','PRIVACY.md','SUPPORT.md','SECURITY.md','THIRD_PARTY_NOTICES.md','media/icon.png']) {
 if (!fs.existsSync(path.join(root,name))) errors.push('Missing ' + name);
}
if (manifest.name === 'codejam') errors.push('The removed Marketplace name codejam is reserved. Use codejam-workspace.');
if (manifest.publisher === 'codejam-team' || !manifest.publisher) errors.push('Set the publisher ID you own: npm run set:publisher -- YOUR_ID');
if (manifest.contributes.configuration.properties['codejam.apiUrl'].default !== 'https://codejam-vdmp.onrender.com') errors.push('Unexpected hosted backend default.');
if (!manifest.icon || !manifest.icon.endsWith('.png')) errors.push('Marketplace icon must be PNG.');
if (errors.length) { console.error(errors.join('\n')); process.exitCode=1; }
else console.log('Package metadata checks passed. Marketplace publisher ownership is not verified by this check. Complete registration, backend security and manual acceptance checks in docs/PUBLISHING.md.');
