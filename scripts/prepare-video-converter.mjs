import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { mkdir, copyFile, readdir, writeFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const target = join(process.cwd(), 'public/video-converter');
await mkdir(target, { recursive: true });
const worker = dirname(require.resolve('@ffmpeg/ffmpeg/worker'));
for (const file of await readdir(worker)) {
  if (file.endsWith('.js')) await copyFile(join(worker, file), join(target, file));
}
const core = dirname(require.resolve('@ffmpeg/core')).replace(/umd$/, 'esm');
for (const file of ['ffmpeg-core.js', 'ffmpeg-core.wasm']) await copyFile(join(core, file), join(target, file));
await writeFile(join(target, 'NOTICE.txt'), 'FFmpeg.wasm core 0.12.10 — GPL-2.0-or-later. Source and build instructions: https://github.com/ffmpegwasm/ffmpeg.wasm/tree/n0.12.10\nFFmpeg.wasm wrapper 0.12.15 — MIT: https://github.com/ffmpegwasm/ffmpeg.wasm\n');
