import { execFileSync, spawnSync } from 'node:child_process';
const read = spawnSync('git', ['config', '--get', 'core.hooksPath'], { encoding: 'utf8' });
if (read.error || ![0, 1].includes(read.status)) throw Error('Unable to read Git hook configuration.');
const existing = read.stdout;
if (existing.trim() && existing.trim() !== '.githooks') throw Error('Existing hooksPath: merge hooks explicitly before installation.');
execFileSync('git', ['config', '--local', 'core.hooksPath', '.githooks']);
console.log('Repository-local quality hooks installed.');
