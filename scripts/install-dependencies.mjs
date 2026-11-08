// Deterministic Linux build install: use the official release API when the
// GitHub release-download edge returns 504. Never execute unverified bytes.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, closeSync, copyFileSync, mkdtempSync, openSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

if (process.platform !== 'linux' || process.arch !== 'x64') throw new Error('This installer is for Linux x64 build runners. Use pnpm install on other platforms.');
const asset = 'https://api.github.com/repos/eugeneware/ffmpeg-static/releases/assets/316528626';
const expected = 'bfe8a8fc511530457b528c48d77b5737527b504a3797a9bc4866aeca69c2dffa';
const directory = mkdtempSync(join(tmpdir(), 'mata-ffmpeg-install-'));
try {
  const archive = join(directory, 'ffmpeg.gz'), binary = join(directory, 'ffmpeg');
  execFileSync('curl', ['-fsSL', '--retry', '3', '--retry-all-errors', '--connect-timeout', '10', '--max-time', '60', '-H', 'Accept: application/octet-stream', asset, '-o', archive], { stdio: 'inherit' });
  if (createHash('sha256').update(readFileSync(archive)).digest('hex') !== expected) throw new Error('Official FFmpeg checksum mismatch');
  const descriptor = openSync(binary, 'wx', 0o700);
  try { execFileSync('gzip', ['-dc', archive], { stdio: ['ignore', descriptor, 'inherit'] }); }
  finally { closeSync(descriptor); }
  const installed = spawnSync('pnpm', ['install', '--frozen-lockfile'], { stdio: 'inherit', env: { ...process.env, FFMPEG_BIN: binary } });
  if (installed.error || installed.status !== 0) throw new Error('Dependency installation failed');
  const destination = resolve('node_modules/ffmpeg-static/ffmpeg');
  copyFileSync(binary, destination);
  chmodSync(destination, 0o755);
  console.log('Official FFmpeg verified and installed.');
} finally { rmSync(directory, { recursive: true, force: true }); }
