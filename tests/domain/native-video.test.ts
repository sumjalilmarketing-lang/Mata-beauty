import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { nativePortableVideo } from "../../lib/media/native-video-client";
it("recognizes compatible MP4/MOV by sample descriptions even with missing MIME", async () => {
 for (const [name, type] of [["studio-long.mp4", "video/mp4"], ["studio-formats.mov", "video/quicktime"]]) {
  const file = new File([await readFile(`tests/e2e/fixtures/${name}`)], name);
  const native = await nativePortableVideo(file);
  expect(native?.type).toBe(type); expect(native?.size).toBe(file.size);
 }
});
it("does not treat HEVC, AVI, malformed boxes or renamed documents as portable video", async () => {
 for (const name of ["studio-formats.mkv", "studio-formats.avi"]) expect(await nativePortableVideo(new File([await readFile(`tests/e2e/fixtures/${name}`)], name))).toBeNull();
 for (const data of [new Uint8Array(32), new TextEncoder().encode("this is not a video"), new Uint8Array([0,0,0,255,109,111,111,118,0,0,0,0,0,0,0,0])]) expect(await nativePortableVideo(new File([data], "fake.mp4"))).toBeNull();
});

it("rejects HEVC in an ISO container and honours cancellation", async () => {
 const bytes = new Uint8Array(await readFile("tests/e2e/fixtures/studio-formats.mov"));
 for (let i=4;i<bytes.length-4;i++) if (String.fromCharCode(...bytes.slice(i,i+4)) === "avc1") {bytes.set(new TextEncoder().encode("hvc1"),i);break;}
 expect(await nativePortableVideo(new File([bytes], "hevc.mov"))).toBeNull();
 const controller = new AbortController(); controller.abort();
 await expect(nativePortableVideo(new File([bytes], "cancel.mov"), controller.signal)).rejects.toThrow("annulée");
});
