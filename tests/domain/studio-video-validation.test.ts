import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpeg from "ffmpeg-static";
import sharp from "sharp";
import { afterAll, beforeAll, expect, it } from "vitest";
import { readBoundedMedia, validateThumbnailBytes, validateVideoBytes } from "@/lib/media/video-validation-server";

let dir: string;
beforeAll(async () => { dir = await mkdtemp(join(tmpdir(), "studio-validation-test-")); });
afterAll(async () => { await rm(dir, { recursive: true, force: true }); });
async function video(extension: string, duration = 2, codec = "libx264") {
  const path = join(dir, `video-${duration}-${codec}.${extension}`);
  execFileSync(ffmpeg!, ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=blue:s=160x240:r=10", "-t", String(duration), "-c:v", codec, "-threads", "1", path]);
  return readFile(path);
}
it.each([["mp4", "libx264"], ["mov", "libx264"], ["webm", "libvpx-vp9"], ["mp4", "libx265"]])("decodes actual %s %s video bytes", async (extension, codec) => {
  const result = await validateVideoBytes(await video(extension, 2, codec));
  expect(result.duration).toBeGreaterThanOrEqual(1);
  expect(result.duration).toBeLessThanOrEqual(2.1);
  expect(result.aspectRatio).toBeCloseTo(2 / 3);
  expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
}, 30_000);
it("rejects forged video bytes and truncated containers", async () => {
  await expect(validateVideoBytes(Buffer.from("<script>fake MP4</script>"))).rejects.toThrow();
  const real = await video("mp4");
  await expect(validateVideoBytes(real.subarray(0, 64))).rejects.toThrow();
});
it("rejects audio-only containers and preserves videos longer than 90 seconds", async () => {
  const path = join(dir, "audio.mp4");
  execFileSync(ffmpeg!, ["-v", "error", "-f", "lavfi", "-i", "sine=frequency=1000:duration=2", "-y", path]);
  await expect(validateVideoBytes(await readFile(path))).rejects.toThrow();
  await expect(validateVideoBytes(await video("mp4", 92))).resolves.toHaveProperty("duration", 92);
}, 30_000);
it("actually decodes allowed thumbnail bytes and rejects renamed garbage", async () => {
  const bytes = await sharp({ create: { width: 4, height: 4, channels: 3, background: "pink" } }).jpeg().toBuffer();
  await expect(validateThumbnailBytes(bytes)).resolves.toMatch(/^[a-f0-9]{64}$/);
  await expect(validateThumbnailBytes(Buffer.from("fake jpg"))).rejects.toThrow();
});
it("bounds upstream bytes without trusting Content-Length", async () => {
  const response = new Response(new Uint8Array(11), { headers: { "Content-Length": "1" } });
  await expect(readBoundedMedia(response, 10)).rejects.toThrow();
});
