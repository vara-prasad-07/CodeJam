const fs = require('node:fs');
const path = require('node:path');
const publisher = process.argv[2];
if (!publisher || !/^[a-z0-9][a-z0-9-]*$/i.test(publisher)) {
 console.error('Usage: npm run set:publisher -- YOUR_MARKETPLACE_PUBLISHER_ID');
 process.exit(1);
}
const file = path.join(__dirname, '..', 'package.json');
const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
manifest.publisher = publisher;
fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n');
console.log('Publisher set to ' + publisher + ' locally. This does not register a Marketplace account. Rebuild the VSIX before uploading.');
