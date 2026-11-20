import { execFile } from 'node:child_process';
import * as path from 'node:path';
import { readFile } from 'node:fs/promises';

export interface Repository {
 root: string; name: string; branch: string; commit: string; summary: string;
 author: string; committedAt: string; dirty: boolean; stack: string; detected: boolean; identity?: string;
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
 let remote = detected ? await read(['remote', 'get-url', 'origin']) : '';
 remote = remote.replace(/^git@([^:]+):/, 'https://$1/').replace(/\.git$/, '');
 let identity = 'local:' + path.basename(root);
 try { const url = new URL(remote); identity = url.host.toLowerCase() + url.pathname.replace(/\/$/, ''); } catch { /* Local-only repository. */ }
 return { identity, root, name: path.basename(root), branch: branch || (commit ? 'Detached HEAD' : 'No commits yet'),
  commit, summary, author, committedAt, dirty: Boolean(status), stack, detected };
}

export async function readGitDiff(root: string, strict = false): Promise<string> {
 const excludes = ['.', ':(exclude)**/.env*', ':(exclude).env*', ':(exclude)**/*.pem', ':(exclude)**/*.key', ':(exclude)**/*credentials*.json', ':(exclude)**/*service*account*.json'];
 const chunks: string[] = [];
 for (const args of [['diff', '--no-ext-diff', '--no-textconv', '--', ...excludes], ['diff', '--cached', '--no-ext-diff', '--no-textconv', '--', ...excludes]]) {
  try { chunks.push(await git(root, args)); } catch { if (strict) { throw new Error('The local Git diff could not be read. Check the checkout and retry.'); } }
 }
 const diff = chunks.filter(Boolean).join('\n\n');
 return diff.length > 20000 ? diff.slice(0, 19800) + '\n[Diff truncated to the 20,000 character context limit]' : diff;
}
