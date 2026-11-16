// Linux x64 CI installer. Prefer the runner's package-managed FFmpeg: the
// GitHub release-assets API may return 403 even to authenticated CI workers.
// Otherwise download the pinned archive and verify its SHA-256 before use.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, closeSync, copyFileSync, mkdtempSync, openSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

if (process.platform !== 'linux' || process.arch !== 'x64') {
  throw new Error('This installer is for Linux x64 build runners. Use pnpm install on other platforms.');
}
const asset = 'https://api.github.com/repos/eugeneware/ffmpeg-static/releases/assets/316528626';
const expected = 'bfe8a8fc511530457b528c48d77b5737527b504a3797a9bc4866aeca69c2dffa';
const directory = mkdtempSync(join(tmpdir(), 'mata-ffmpeg-install-'));
try {
  let source = '';
  const system = spawnSync('sh', ['-c', 'command -v ffmpeg'], { encoding: 'utf8' });
  const candidate = system.status === 0 ? system.stdout.trim().split('\n')[0] : '';
  if (candidate) {
    const probe = spawnSync(candidate, ['-version'], { encoding: 'utf8' });
    if (probe.status === 0 && /^ffmpeg version /m.test(probe.stdout ?? '')) {
      source = candidate;
      console.log('Using verified runner FFmpeg binary for CI.');
    }
  }
  if (!source) {
    const archive = join(directory, 'ffmpeg.gz');
    const binary = join(directory, 'ffmpeg');
    execFileSync('curl', [
      '-fsSL', '--retry', '3', '--retry-all-errors', '--connect-timeout', '10',
      '--max-time', '60', '-H', 'Accept: application/octet-stream',
      asset, '-o', archive,
    ], { stdio: 'inherit' });
    if (createHash('sha256').update(readFileSync(archive)).digest('hex') !== expected) {
      throw new Error('Official FFmpeg checksum mismatch');
    }
    const descriptor = openSync(binary, 'wx', 0o700);
    try { execFileSync('gzip', ['-dc', archive], { stdio: ['ignore', descriptor, 'inherit'] }); }
    finally { closeSync(descriptor); }
    source = binary;
  }
  const installed = spawnSync('pnpm', ['install', '--frozen-lockfile'], {
    stdio: 'inherit',
    env: { ...process.env, FFMPEG_BIN: source },
  });
  if (installed.error || installed.status !== 0) {
    throw new Error('Dependency installation failed');
  }
  const destination = resolve('node_modules/ffmpeg-static/ffmpeg');
  copyFileSync(source, destination);
  chmodSync(destination, 0o755);
  console.log('FFmpeg is ready for the test runner.');
} finally {
  rmSync(directory, { recursive: true, force: true });
}
