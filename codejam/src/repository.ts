import { execFile } from 'node:child_process';
import * as path from 'node:path';
import { readFile } from 'node:fs/promises';

export interface Repository {
 root: string; name: string; branch: string; commit: string; summary: string;
 author: string; committedAt: string; dirty: boolean; stack: string; detected: boolean;
}
function git(cwd: string, args: string[]): Promise<string> {
 return new Promise((resolve, reject) => execFile('git', ['-C', cwd, ...args],
  { timeout: 5000, maxBuffer: 1024 * 1024, windowsHide: true },
  (error, stdout) => error ? reject(error) : resolve(stdout.trim())));
}
export async function detectRepository(folder: string): Promise<Repository> {
 let root = folder, detected = false;
 try { root = await git(folder, ['rev-parse', '--show-toplevel']); detected = true; } catch { /* Non-Git folders are supported. */ }
 const read = async (args: string[]) => { try { return await git(root, args); } catch { return ''; } };
 const [branch, commit, log, status] = detected ? await Promise.all([
  read(['symbolic-ref', '--short', 'HEAD']), read(['rev-parse', '--short', 'HEAD']),
  read(['log', '-1', '--format=%s%n%an%n%aI']), read(['status', '--porcelain', '--untracked-files=normal'])
 ]) : ['', '', '', ''];
 let stack = 'Workspace';
 for (const candidate of [...new Set([folder, root])]) {
  try {
   const pkg = JSON.parse(await readFile(path.join(candidate, 'package.json'), 'utf8'));
   stack = `${pkg.devDependencies?.typescript || pkg.dependencies?.typescript ? 'TypeScript' : 'JavaScript'} · Node.js${pkg.engines?.node ? ' ' + pkg.engines.node : ''}`;
   break;
  } catch { /* No package metadata. */ }
 }
 const [summary = '', author = '', committedAt = ''] = log.split('\n');
 return { root, name: path.basename(root), branch: branch || (commit ? 'Detached HEAD' : 'No commits yet'),
  commit, summary, author, committedAt, dirty: Boolean(status), stack, detected };
}
