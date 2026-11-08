import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
const script = resolve('scripts/quality-hygiene.mjs');
test('inspect the staged blob, reject credentials, conflicts and private env files', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'mata-quality-'));
  const git = args => execFileSync('git', args, { cwd, stdio: 'pipe' });
  const check = () => spawnSync(process.execPath, [script], { cwd, encoding: 'utf8' });
  try {
    git(['init']); writeFileSync(join(cwd, 'safe.txt'), 'safe\n'); git(['add', 'safe.txt']);
    assert.equal(check().status, 0);
    const secret = ['ghp', 'x'.repeat(36)].join('_');
    writeFileSync(join(cwd, 'safe.txt'), secret); git(['add', 'safe.txt']); writeFileSync(join(cwd, 'safe.txt'), 'safe\n');
    const rejected = check(); assert.equal(rejected.status, 1); assert.ok(!rejected.stderr.includes(secret));
    git(['add', 'safe.txt']); writeFileSync(join(cwd, 'merge.txt'), '<'.repeat(7) + ' branch\n'); git(['add', 'merge.txt']); assert.equal(check().status, 1);
    git(['rm', '--cached', 'merge.txt']); writeFileSync(join(cwd, '.env'), 'X=example'); git(['add', '.env']); assert.equal(check().status, 1);
    git(['rm', '--cached', '.env']); writeFileSync(join(cwd, '.env.example'), 'X='); git(['add', '.env.example']); assert.equal(check().status, 0);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test('the full-tree scan safely skips tracked files deleted in the worktree', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'mata-quality-deleted-'));
  const git = args => execFileSync('git', args, { cwd, stdio: 'pipe' });
  try {
    git(['init']);
    writeFileSync(join(cwd, 'removed.tsx'), 'safe\n');
    git(['add', 'removed.tsx']);
    rmSync(join(cwd, 'removed.tsx'));
    const result = spawnSync(process.execPath, [script, '--all'], { cwd, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Hygiene passed/);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
