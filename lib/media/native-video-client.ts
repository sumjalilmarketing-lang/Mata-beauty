/** Read sample descriptions, rather than trusting a .mp4/.mov filename or Safari's HEVC support. */
export async function nativePortableVideo(file: File, signal?: AbortSignal): Promise<File | null> {
  if (file.size > 100 * 1024 * 1024) return null;
  const text = (bytes: Uint8Array, offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  const codecs: string[] = [];
  let valid = true, boxes = 0;
  const inspect = (bytes: Uint8Array, start: number, end: number, depth = 0) => {
    if (depth > 8) { valid = false; return; }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let offset = start; offset + 8 <= end;) {
      if (++boxes > 10000) { valid = false; return; }
      const size = view.getUint32(offset);
      const type = text(bytes, offset + 4);
      if (size < 8 || offset + size > end) { valid = false; return; }
      if (["moov", "trak", "mdia", "minf", "stbl"].includes(type)) inspect(bytes, offset + 8, offset + size, depth + 1);
      if (type === "stsd") {
        if (size < 16) { valid = false; return; }
        let entry = offset + 16;
        const count = view.getUint32(offset + 12);
        if (!count || count > 16) { valid = false; return; }
        for (let index = 0; index < count; index++) {
          if (entry + 8 > offset + size) { valid = false; return; }
          const length = view.getUint32(entry);
          if (length < 8 || entry + length > offset + size) { valid = false; return; }
          const codec = text(bytes, entry + 4);
          codecs.push(codec);
          if (codec === "avc1") {
            // VisualSampleEntry has 78 bytes after its box header.
            let config = entry + 86, found = false;
            while (config + 10 <= entry + length) {
              const configSize = view.getUint32(config);
              if (configSize < 8 || config + configSize > entry + length) break;
              if (text(bytes, config + 4) === "avcC") {
                found = [66, 77, 88, 100].includes(bytes[config + 9]);
                break;
              }
              config += configSize;
            }
            if (!found) valid = false;
          }
          entry += length;
        }
      }
      offset += size;
    }
  };
  let brand = "";
  let topBoxes = 0;
  for (let offset = 0; offset + 16 <= file.size;) {
    if (signal?.aborted) throw new DOMException("Préparation annulée", "AbortError");
    if (++topBoxes > 1024) return null;
    const bytes = new Uint8Array(await file.slice(offset, offset + 16).arrayBuffer());
    const view = new DataView(bytes.buffer);
    let size = view.getUint32(0), header = 8;
    if (size === 1) { size = view.getUint32(8) * 2 ** 32 + view.getUint32(12); header = 16; }
    if (!Number.isSafeInteger(size) || size < header || offset + size > file.size) return null;
    const type = text(bytes, 4);
    if (type === "ftyp") brand = text(bytes, 8);
    if (type === "moov") {
      if (size > 4 * 1024 * 1024) return null;
      const moov = new Uint8Array(await file.slice(offset + header, offset + size).arrayBuffer());
      inspect(moov, 0, moov.length);
    }
    offset += size;
  }
  if (!brand || !valid || !codecs.includes("avc1") || codecs.some(codec => !["avc1", "mp4a"].includes(codec))) return null;
  const quicktime = brand === "qt  ";
  const extension = quicktime ? "mov" : "mp4";
  return new File([file], `${file.name.replace(/\.[^.]+$/, "")}.${extension}`, { type: quicktime ? "video/quicktime" : "video/mp4" });
}
