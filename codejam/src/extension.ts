import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';

export function activate(context: vscode.ExtensionContext) {
 const setup = (webview: vscode.Webview) => {
  webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')] };
  const resource = (name: string) => webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', name));
  const nonce = randomBytes(16).toString('hex');
  webview.html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';"><link rel="stylesheet" href="${resource('style.css')}"><title>CodeJam</title></head><body><div id="app"></div><script nonce="${nonce}" src="${resource('app.js')}"></script></body></html>`;
  context.subscriptions.push(webview.onDidReceiveMessage(async (message: unknown) => {
   if (!message || typeof message !== 'object' || !('type' in message)) { return; }
   const data = message as { type: string; path?: string; line?: number };
   if (data.type === 'selection') {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.selection.isEmpty) {
     await webview.postMessage({ type: 'notice', text: 'Select a few lines in an editor, then attach them here.' });
     return;
    }
    await webview.postMessage({ type: 'selection', attachment: {
     path: vscode.workspace.asRelativePath(editor.document.uri), line: editor.selection.start.line + 1,
     endLine: editor.selection.end.line + 1, code: editor.document.getText(editor.selection).slice(0, 12000)
    } });
   }
   if (data.type === 'openFile' && typeof data.path === 'string') {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!root || data.path.includes('..') || /^[\\/]|^[a-z]:/i.test(data.path)) { return; }
    try {
     const doc = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(root, data.path));
     const line = Math.max(0, Math.min(doc.lineCount - 1, (Number(data.line) || 1) - 1));
     await vscode.window.showTextDocument(doc, { selection: new vscode.Range(line, 0, line, 0) });
    } catch { await webview.postMessage({ type: 'notice', text: 'This sample file is not in your checkout. Attach your own code to open it here.' }); }
   }
  }));
 };
 context.subscriptions.push(vscode.window.registerWebviewViewProvider('codejam.workspace', {
  resolveWebviewView(view) { setup(view.webview); }
 }, { webviewOptions: { retainContextWhenHidden: true } }));
 context.subscriptions.push(vscode.commands.registerCommand('codejam.open', () => vscode.commands.executeCommand('codejam.workspace.focus')));
 context.subscriptions.push(vscode.commands.registerCommand('codejam.openPanel', () => {
  const panel = vscode.window.createWebviewPanel('codejam.preview', 'CodeJam', vscode.ViewColumn.One, { enableScripts: true, retainContextWhenHidden: true });
  setup(panel.webview);
 }));
 context.subscriptions.push(vscode.commands.registerCommand('codejam.helloWorld', () => {
  vscode.window.showInformationMessage('Hello World from CodeJam!');
  return vscode.commands.executeCommand('codejam.workspace.focus');
 }));
}
export function deactivate() {}
