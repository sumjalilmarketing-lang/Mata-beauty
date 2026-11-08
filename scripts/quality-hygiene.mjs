import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
const all = process.argv.includes('--all');
const git = args => execFileSync('git', args, { maxBuffer: 32 * 1024 * 1024 });
const paths = git(all ? ['ls-files', '-z'] : ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']).toString().split('\0').filter(Boolean);
const issues = [];
for (const path of paths) {
  if (all && !existsSync(path)) continue;
  if (/(^|\/)\.env(?:\.|$)/.test(path) && !/\.(example|sample|template)$/.test(path)) {
    issues.push(`${path}: private environment file`); continue;
  }
  const body = all ? readFileSync(path) : git(['show', `:${path}`]);
  if (body.includes(0)) continue;
  const text = body.toString('utf8');
  if (/^(?:<{7}|={7}|>{7})(?:\s|$)/m.test(text)) issues.push(`${path}: merge conflict marker`);
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)
      || /\b(?:ghp_|github_pat_)[A-Za-z0-9_]{30,}\b/.test(text)
      || /\bAKIA[A-Z0-9]{16}\b/.test(text)) issues.push(`${path}: possible credential (content withheld)`);
}
if (issues.length) { console.error(issues.join('\n')); process.exit(1); }
console.log(`Hygiene passed (${paths.length} ${all ? 'tracked' : 'staged'} files). This is not an exhaustive secret scanner.`);
