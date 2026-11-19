import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';

suite('CodeJam extension activation', () => {
 test('registers the declared collaboration commands', async () => {
  const manifest = JSON.parse(readFileSync(path.join(__dirname, '../../package.json'), 'utf8'));
  const extension = vscode.extensions.getExtension(`${manifest.publisher}.${manifest.name}`);
  assert.ok(extension, 'CodeJam must be loaded by the extension development host');
  await extension.activate();
  const commands = new Set(await vscode.commands.getCommands(true));
  for (const command of manifest.contributes.commands) {
   assert.ok(commands.has(command.command), `Missing command: ${command.command}`);
  }
 });
});
