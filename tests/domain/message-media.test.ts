import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { createFile } from "mp4box";
import { describe, expect, it, vi } from "vitest";
import { imageLimit, preflightMessageMp4, validMediaDeclaration, validateMessageMedia, videoLimit } from "../../lib/messaging/media";
import { sourceMessageMediaPath, validatedMessageMediaPath } from "../../lib/messaging/storage-path";

vi.mock("mp4box", async importOriginal => {
  const actual = await importOriginal<typeof import("mp4box")>();
  return { ...actual, createFile: vi.fn(actual.createFile) };
});

function box(type: string, ...content: Buffer[]) {
  const payload = Buffer.concat(content), result = Buffer.alloc(8 + payload.length);
  result.writeUInt32BE(result.length, 0); result.write(type, 4, "ascii"); payload.copy(result, 8);
  return result;
}
function uints(...values: number[]) { const bytes = Buffer.alloc(values.length * 4); values.forEach((value, index) => bytes.writeUInt32BE(value, index * 4)); return bytes; }
function sampleContainer(options: { samples?: number; ticks?: number; metadata?: boolean; extraSampleTable?: Buffer } = {}) {
  const ftyp = box("ftyp", Buffer.from("isom"), uints(0), Buffer.from("isomavc1"));
  const sample = Buffer.from([0, 0, 0, 3, 0x65, 0x88, 0x84]);
  const mvhd = Buffer.alloc(100); mvhd.writeUInt32BE(1000, 12); mvhd.writeUInt32BE(1000, 16); mvhd.writeUInt32BE(2, 96);
  const tkhd = Buffer.alloc(84); tkhd.writeUInt32BE(3, 0); tkhd.writeUInt32BE(1, 12); tkhd.writeUInt32BE(1000, 20); tkhd.writeUInt32BE(16 << 16, 76); tkhd.writeUInt32BE(16 << 16, 80);
  const mdhd = Buffer.alloc(24); mdhd.writeUInt32BE(1000, 12); mdhd.writeUInt32BE(1000, 16);
  const hdlr = Buffer.alloc(25); hdlr.write("vide", 8, "ascii");
  const visual = Buffer.alloc(78); visual.writeUInt16BE(1, 6); visual.writeUInt16BE(16, 24); visual.writeUInt16BE(16, 26); visual.writeUInt16BE(24, 74);
  const avcc = box("avcC", Buffer.from([1, 0x42, 0, 10, 0xff, 0xe1, 0, 7, 0x67, 0x42, 0, 10, 0xda, 0x7b, 0x20, 1, 0, 4, 0x68, 0xce, 0x0f, 0xc8]));
  const stsd = box("stsd", uints(0, 1), box("avc1", visual, avcc));
  const stts = box("stts", uints(0, 1, 1, options.ticks ?? 1000));
  const stsc = box("stsc", uints(0, 1, 1, 1, 1));
  const stsz = box("stsz", uints(0, sample.length, options.samples ?? 1));
  const dinf = box("dinf", box("dref", uints(0, 1), box("url ", uints(1))));
  const build = (offset: number) => box("moov", box("mvhd", mvhd), box("trak", box("tkhd", tkhd), box("mdia", box("mdhd", mdhd), box("hdlr", hdlr), box("minf", box("vmhd", Buffer.alloc(12)), dinf, box("stbl", stsd, stts, stsc, stsz, box("stco", uints(0, 1, offset)), ...(options.extraSampleTable ? [options.extraSampleTable] : []))))), ...(options.metadata ? [box("udta", Buffer.from("private GPS metadata"))] : []));
  const moov = build(ftyp.length + build(1).length + 8);
  return Buffer.concat([ftyp, moov, box("mdat", sample)]);
}

describe("private message media validation", () => {
  it("builds and cleans canonical paths for numeric MP4 and image extensions", () => {
    expect(validatedMessageMediaPath("conv/user/photo.png")).toBe("conv/user/photo-validated.png");
    expect(validatedMessageMediaPath("conv/user/video.mp4")).toBe("conv/user/video-validated.mp4");
    expect(sourceMessageMediaPath("conv/user/video-validated.mp4")).toBe("conv/user/video.mp4");
  });
  it("rejects executable, vector, empty and oversized declarations", () => {
    for (const type of ["text/html", "image/svg+xml", "application/pdf", "video/webm"]) expect(validMediaDeclaration(type, 100)).toBe(false);
    expect(validMediaDeclaration("image/png", 0)).toBe(false);
    expect(validMediaDeclaration("image/png", imageLimit + 1)).toBe(false);
    expect(validMediaDeclaration("video/mp4", videoLimit + 1)).toBe(false);
  });
  it("rejects MIME spoofing and malformed video containers", async () => {
    const script = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    await expect(validateMessageMedia(script, "image/png")).rejects.toThrow();
    await expect(validateMessageMedia(script, "video/mp4")).rejects.toThrow();
    const forged = Buffer.alloc(32);
    forged.writeUInt32BE(32, 0); forged.write("ftyp", 4); forged.write("isom", 8);
    await expect(validateMessageMedia(forged, "video/mp4")).rejects.toThrow();
  });
  it("decodes photos and removes metadata and trailing payloads", async () => {
    const original = await sharp({ create: { width: 80, height: 60, channels: 3, background: "#a51b68" } }).jpeg().withMetadata().toBuffer();
    const input = Buffer.concat([original, Buffer.from("<script>not an image</script>")]);
    const clean = await validateMessageMedia(input, "image/jpeg");
    expect(clean.width).toBe(80); expect(clean.height).toBe(60);
    expect(clean.bytes.includes(Buffer.from("<script>"))).toBe(false);
    const meta = await sharp(clean.bytes).metadata();
    expect(meta.exif).toBeUndefined();
    expect(clean.duration).toBeNull();
  });
  it("validates an actual local PNG and rejects truncated data", async () => {
    const bytes = await readFile("public/brand/icon-64.png");
    expect((await validateMessageMedia(bytes, "image/png")).width).toBe(64);
    await expect(validateMessageMedia(bytes.subarray(0, 25), "image/png")).rejects.toThrow();
  });
  it("rejects a constant-size stsz allocation bomb before constructing MP4Box", async () => {
    vi.mocked(createFile).mockClear();
    await expect(validateMessageMedia(sampleContainer({ samples: 0xffffffff }), "video/mp4")).rejects.toThrow();
    expect(createFile).not.toHaveBeenCalled();
  });
  it("rejects hidden sample duration and unsupported allocation tables before MP4Box", async () => {
    vi.mocked(createFile).mockClear();
    await expect(validateMessageMedia(sampleContainer({ ticks: 61000 }), "video/mp4")).rejects.toThrow();
    await expect(validateMessageMedia(sampleContainer({ extraSampleTable: box("sgpd", uints(0, 0xffffffff)) }), "video/mp4")).rejects.toThrow();
    expect(createFile).not.toHaveBeenCalled();
  });
  it("accepts a bounded MP4 structure and strips metadata without shifting sample offsets", async () => {
    const original = sampleContainer({ metadata: true });
    const checked = preflightMessageMp4(original);
    expect(checked.bytes.length).toBe(original.length);
    expect(checked.bytes.includes(Buffer.from("private GPS metadata"))).toBe(false);
    expect(original.includes(Buffer.from("private GPS metadata"))).toBe(true);
    const validated = await validateMessageMedia(original, "video/mp4");
    expect(validated.duration).toBe(1); expect(validated.width).toBe(16); expect(validated.height).toBe(16);
    // This fixture proves bounded container validation, not codec decoding.
  });
});
