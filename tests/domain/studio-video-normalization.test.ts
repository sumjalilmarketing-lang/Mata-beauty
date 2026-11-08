import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpeg from "ffmpeg-static";
import { afterAll, beforeAll, expect, it } from "vitest";
import { normalizeStudioVideo, validateThumbnailBytes, validateVideoBytes } from "@/lib/media/video-validation-server";
let dir: string;
beforeAll(async()=>{dir=await mkdtemp(join(tmpdir(),"studio-server-test-"));});
afterAll(async()=>{await rm(dir,{recursive:true,force:true});});
it.each(["avi","mkv","mov","mp4"])("prepares real %s as portable MP4 and JPEG without a browser worker",async extension=>{
 const bytes=await readFile(extension === "mp4" ? "tests/e2e/fixtures/studio-long.mp4" : `tests/e2e/fixtures/studio-formats.${extension}`);
 const output=await normalizeStudioVideo(bytes);
 expect(output.video.subarray(4,8).toString()).toBe("ftyp");
 expect(output.duration).toBeGreaterThan(0);expect(output.aspectRatio).toBeGreaterThan(0);
 await expect(validateVideoBytes(output.video)).resolves.toHaveProperty("sha256");
 await expect(validateThumbnailBytes(output.thumbnail)).resolves.toMatch(/^[a-f0-9]{64}$/);
},30000);
it("converts real HEVC phone video and retains duration above 90 seconds",async()=>{
 const path=join(dir,"phone.mov");
 execFileSync(ffmpeg!,["-v","error","-f","lavfi","-i","color=s=160x240:r=2","-t","92","-c:v","libx265","-x265-params","log-level=error:pools=none","-threads","1",path]);
 const output=await normalizeStudioVideo(await readFile(path));
 expect(output.duration).toBeGreaterThan(90);
},30000);
it("rejects a document or a network playlist before producing publishable output",async()=>{
 await expect(normalizeStudioVideo(Buffer.from("<html>not a video</html>"))).rejects.toThrow();
 await expect(normalizeStudioVideo(Buffer.from("#EXTM3U\n#EXTINF:10,\nhttps://example.invalid/private.mp4"))).rejects.toThrow();
});
