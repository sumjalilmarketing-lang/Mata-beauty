import sharp from "sharp";
import { createFile, MP4BoxBuffer, type Movie } from "mp4box";

export const imageLimit = 10 * 1024 * 1024;
export const videoLimit = 20 * 1024 * 1024;
export const mediaTypes = ["image/jpeg", "image/png", "image/webp", "video/mp4"] as const;
export type MessageMediaType = typeof mediaTypes[number];

export class MediaValidationError extends Error {}

export function validMediaDeclaration(type: string, size: number): type is MessageMediaType {
  return mediaTypes.some(value => value === type) && Number.isInteger(size) && size > 0 && size <= (type === "video/mp4" ? videoLimit : imageLimit);
}

type TrackBounds = { timescale: number; sampleCount: number; timedSamples: number; ticks: number };
const maxSamples = 20_000;
const mp4Children: Record<string, readonly string[]> = {
  root: ["ftyp", "moov", "mdat", "free", "skip", "wide"],
  moov: ["mvhd", "trak", "udta", "meta", "iods", "free"],
  trak: ["tkhd", "mdia", "edts", "udta", "meta", "free"],
  mdia: ["mdhd", "hdlr", "minf", "free"],
  minf: ["vmhd", "smhd", "hdlr", "dinf", "stbl", "free"],
  dinf: ["dref"], edts: ["elst"],
  stbl: ["stsd", "stts", "ctts", "stsc", "stsz", "stz2", "stco", "co64", "stss", "sgpd", "sbgp", "free"],
  dref: ["url "], stsd: ["avc1", "avc3", "mp4a"],
  avc1: ["avcC", "btrt", "pasp", "clap", "colr", "fiel", "gama"],
  avc3: ["avcC", "btrt", "pasp", "clap", "colr", "fiel", "gama"],
  mp4a: ["esds", "btrt"],
};

/** Bound every allocation-driving table BEFORE MP4Box sees untrusted bytes. */
export function preflightMessageMp4(input: Buffer) {
  if (input.length > videoLimit) throw new MediaValidationError("La vidéo est trop volumineuse.");
  const bytes = Buffer.from(input);
  const mediaRanges: Array<{ start: number; end: number }> = [];
  const tracks: TrackBounds[] = [];
  let boxes = 0;
  const invalid = (): never => { throw new MediaValidationError("Le fichier MP4 est invalide ou utilise une structure non prise en charge."); };
  function descriptors(start: number, end: number, depth = 0) {
    if (depth > 4 || end - start > 512) invalid();
    let cursor = start;
    while (cursor < end) {
      if (cursor + 2 > end) invalid();
      const tag = bytes[cursor++]; let size = 0, lengthBytes = 0, value = 0;
      do {
        if (++lengthBytes > 4 || cursor >= end) invalid();
        value = bytes[cursor++]; size = size * 128 + (value & 127);
      } while (value & 128);
      const limit = cursor + size;
      if (size < 1 || limit > end) invalid();
      if (tag === 3) {
        if (cursor + 3 > limit) invalid();
        const flags = bytes[cursor + 2]; cursor += 3;
        // External stream URLs and dependent streams are not supported.
        if (flags & 0xe0) invalid();
        descriptors(cursor, limit, depth + 1);
      } else if (tag === 4) {
        if (cursor + 13 > limit) invalid();
        descriptors(cursor + 13, limit, depth + 1);
      } else if (tag !== 5 && tag !== 6) invalid();
      cursor = limit;
    }
  }
  function scan(start: number, end: number, parent: string, depth: number, track?: TrackBounds): string[] {
    if (depth > 10) invalid();
    let offset = start;
    const types: string[] = [];
    while (offset < end) {
      if (++boxes > 256 || offset + 8 > end) invalid();
      const type = bytes.toString("ascii", offset + 4, offset + 8);
      if (!mp4Children[parent]?.includes(type)) invalid();
      let size = bytes.readUInt32BE(offset), header = 8;
      if (size === 1) {
        if (offset + 16 > end) invalid();
        const extended = bytes.readBigUInt64BE(offset + 8);
        if (extended > BigInt(videoLimit)) invalid();
        size = Number(extended); header = 16;
      } else if (size === 0) size = end - offset;
      const payload = offset + header, limit = offset + size, length = size - header;
      if (size < header || limit > end) invalid();
      if (!["free", "skip", "wide", "mdat", "trak"].includes(type) && types.includes(type)) invalid();
      types.push(type);
      const need = (amount: number) => { if (length < amount) invalid(); };
      const version = () => { need(4); const value = bytes[payload]; if (value > 1) invalid(); return value; };
      const table = (entrySize: number, max = maxSamples) => {
        need(8); const count = bytes.readUInt32BE(payload + 4);
        if (count > max || length !== 8 + entrySize * count) invalid();
        return count;
      };
      if (["udta", "meta", "iods", "free", "skip", "wide"].includes(type)) {
        // Preserve sample offsets while removing location/user metadata and avoiding
        // unneeded descriptor parsers. The delivered bytes use this sanitized copy.
        bytes.write("free", offset + 4, "ascii"); bytes.fill(0, payload, limit);
      } else if (type === "ftyp") {
        if (length < 8 || length > 256 || length % 4 !== 0 || offset !== 0) invalid();
      } else if (type === "mdat") {
        mediaRanges.push({ start: payload, end: limit });
      } else if (type === "moov") {
        if (size > 2 * 1024 * 1024) invalid();
        const children = scan(payload, limit, type, depth + 1);
        if (!children.includes("mvhd") || !children.includes("trak")) invalid();
      } else if (type === "trak") {
        if (tracks.length >= 2) invalid();
        const bounds: TrackBounds = { timescale: 0, sampleCount: 0, timedSamples: 0, ticks: 0 }; tracks.push(bounds);
        const children = scan(payload, limit, type, depth + 1, bounds);
        if (!children.includes("tkhd") || !children.includes("mdia") || bounds.sampleCount < 1 || bounds.sampleCount !== bounds.timedSamples || bounds.timescale < 1 || bounds.ticks <= 0 || bounds.ticks / bounds.timescale > 60.1) invalid();
      } else if (["mdia", "minf", "dinf", "edts", "stbl"].includes(type)) {
        const children = scan(payload, limit, type, depth + 1, track);
        if (type === "stbl" && (!children.includes("stsd") || !children.includes("stts") || !children.includes("stsc") || Number(children.includes("stsz")) + Number(children.includes("stz2")) !== 1 || Number(children.includes("stco")) + Number(children.includes("co64")) !== 1)) invalid();
      } else if (type === "mvhd" || type === "mdhd") {
        const v = version(); need(v ? 32 : 20);
        const timescale = bytes.readUInt32BE(payload + (v ? 20 : 12));
        const duration = v ? Number(bytes.readBigUInt64BE(payload + 24)) : bytes.readUInt32BE(payload + 16);
        if (!timescale || duration <= 0 || duration / timescale > 60.1) invalid();
        if (type === "mdhd" && track) track.timescale = timescale;
      } else if (type === "stsz" || type === "stz2") {
        if (version() !== 0) invalid(); need(12);
        const count = bytes.readUInt32BE(payload + 8);
        if (!count || count > maxSamples || !track) invalid();
        if (type === "stsz") {
          const sampleSize = bytes.readUInt32BE(payload + 4);
          if (length !== 12 + (sampleSize ? 0 : count * 4) || sampleSize * count > input.length) invalid();
          if (!sampleSize) for (let i = 0; i < count; i++) if (bytes.readUInt32BE(payload + 12 + i * 4) > input.length) invalid();
        } else {
          const bits = bytes[payload + 7];
          if (![4, 8, 16].includes(bits) || length !== 12 + Math.ceil(count * bits / 8)) invalid();
        }
        track!.sampleCount = count;
      } else if (type === "stts" || type === "ctts") {
        const v = version(); if (type === "stts" && v !== 0) invalid();
        const count = table(8); let samples = 0, ticks = 0;
        for (let i = 0; i < count; i++) {
          const n = bytes.readUInt32BE(payload + 8 + i * 8); samples += n;
          if (!n || samples > maxSamples) invalid();
          if (type === "stts") ticks += n * bytes.readUInt32BE(payload + 12 + i * 8);
        }
        if (type === "stts" && track) { track.timedSamples = samples; track.ticks = ticks; }
      } else if (type === "stsc") {
        if (version() !== 0) invalid(); const count = table(12); let previous = 0;
        for (let i = 0; i < count; i++) {
          const first = bytes.readUInt32BE(payload + 8 + i * 12), perChunk = bytes.readUInt32BE(payload + 12 + i * 12), description = bytes.readUInt32BE(payload + 16 + i * 12);
          if (first <= previous || first > maxSamples || !perChunk || perChunk > maxSamples || description !== 1) invalid(); previous = first;
        }
        if (!count) invalid();
      } else if (type === "stco" || type === "co64" || type === "stss") {
        if (version() !== 0) invalid(); const width = type === "co64" ? 8 : 4, count = table(width);
        for (let i = 0; i < count; i++) {
          const value = width === 8 ? Number(bytes.readBigUInt64BE(payload + 8 + i * width)) : bytes.readUInt32BE(payload + 8 + i * width);
          if (value < 1 || value > (type === "stss" ? maxSamples : input.length)) invalid();
        }
      } else if (type === "sgpd" || type === "sbgp") {
        const v = version(); need(type === "sgpd" || v === 1 ? 16 : 12);
        // AAC roll-recovery groups emitted by mobile/FFmpeg have fixed two-byte
        // descriptions. Reject unknown/encrypted group parsers and variable types.
        const grouping = bytes.toString("ascii", payload + 4, payload + 8);
        if (grouping !== "roll" && grouping !== "prol") invalid();
        if (type === "sgpd") {
          if (v !== 1) invalid();
          const entryLength = bytes.readUInt32BE(payload + 8), count = bytes.readUInt32BE(payload + 12);
          if (entryLength !== 2 || count > maxSamples || length !== 16 + count * 2) invalid();
        } else {
          const prefix = v === 1 ? 16 : 12, count = bytes.readUInt32BE(payload + prefix - 4);
          if (count > maxSamples || length !== prefix + count * 8) invalid();
          let samples = 0;
          for (let i = 0; i < count; i++) {
            samples += bytes.readUInt32BE(payload + prefix + i * 8);
            if (samples > maxSamples || bytes.readUInt32BE(payload + prefix + i * 8 + 4) > maxSamples) invalid();
          }
        }
      } else if (type === "stsd" || type === "dref") {
        if (version() !== 0) invalid(); need(8);
        const count = bytes.readUInt32BE(payload + 4);
        if (count !== 1) invalid();
        const children = scan(payload + 8, limit, type, depth + 1, track);
        if (children.length !== count) invalid();
      } else if (type === "avc1" || type === "avc3" || type === "mp4a") {
        const fixed = type === "mp4a" ? 28 : 78; need(fixed);
        if (bytes.readUInt16BE(payload + 6) !== 1 || (type === "mp4a" && bytes.readUInt16BE(payload + 8) !== 0)) invalid();
        const children = scan(payload + fixed, limit, type, depth + 1, track);
        if (!children.includes(type === "mp4a" ? "esds" : "avcC")) invalid();
      } else if (type === "url ") {
        need(4); if (length !== 4 || bytes.readUInt32BE(payload) !== 1) invalid();
      } else if (type === "esds") {
        if (version() !== 0 || length > 516) invalid(); descriptors(payload + 4, limit);
      } else if (type === "avcC") {
        need(7); if (length > 65536 || bytes[payload] !== 1) invalid();
        // MP4Box's AVC loops are byte-sized (max 255), but each NAL length
        // still must fit its own box before readUint8Array can allocate it.
        let at = payload + 6;
        for (const group of [bytes[payload + 5] & 31, -1]) {
          const count = group < 0 ? (at < limit ? bytes[at++] : invalid()) : group;
          for (let i = 0; i < count; i++) { if (at + 2 > limit) invalid(); const size = bytes.readUInt16BE(at); at += 2; if (!size || at + size > limit) invalid(); at += size; }
        }
        if (at < limit) {
          if (at + 4 > limit) invalid(); at += 3; const count = bytes[at++];
          for (let i = 0; i < count; i++) { if (at + 2 > limit) invalid(); const size = bytes.readUInt16BE(at); at += 2; if (!size || at + size > limit) invalid(); at += size; }
        }
        if (at !== limit) invalid();
      } else if (type === "elst") {
        const v = version(); table(v ? 20 : 12, 16);
      } else {
        const fixedSizes: Record<string, number> = { tkhd: 84, hdlr: 24, vmhd: 12, smhd: 8, btrt: 12, pasp: 8, clap: 32, colr: 10, fiel: 2, gama: 4 };
        need(fixedSizes[type] ?? invalid());
        if (length > 256) invalid();
        if (type === "tkhd" && version() === 1) need(96);
      }
      offset = limit;
    }
    return types;
  }
  const top = scan(0, bytes.length, "root", 0);
  if (top[0] !== "ftyp" || !top.includes("moov") || !top.includes("mdat")) invalid();
  return { bytes, mediaRanges };
}

export async function validateMessageMedia(bytes: Buffer, declaredType: string) {
  if (!validMediaDeclaration(declaredType, bytes.length)) throw new MediaValidationError("Photo : 10 Mo maximum. Vidéo MP4 : 20 Mo maximum.");
  if (declaredType === "video/mp4") {
    const checked = preflightMessageMp4(bytes);
    const file = createFile(false);
    const result: { movie?: Movie; invalid: boolean } = { invalid: false };
    file.onReady = movie => { result.movie = movie; };
    file.onError = () => { result.invalid = true; };
    try {
      file.appendBuffer(MP4BoxBuffer.fromArrayBuffer(Uint8Array.from(checked.bytes).buffer, 0));
      file.flush();
    } catch { throw new MediaValidationError("La vidéo ne peut pas être validée."); }
    const movie = result.movie;
    const video = movie?.videoTracks[0];
    const duration = movie ? movie.duration / movie.timescale : NaN;
    const tracksValid = movie?.tracks.every(track => /^(?:avc1|avc3|mp4a)(?:\.|$)/.test(track.codec) && track.nb_samples > 0 && track.nb_samples <= 20_000);
    const externalReferences = file.getBoxes("url ", false).some(box => "flags" in box && box.flags !== 1) || file.getBoxes("urn ", false).length > 0;
    if (result.invalid || !movie || movie.isFragmented || movie.videoTracks.length !== 1 || movie.audioTracks.length > 1 || movie.tracks.length > 2 || !video?.video || !tracksValid || externalReferences) {
      throw new MediaValidationError("Utilisez une vidéo MP4 standard H.264, avec un son AAC éventuel.");
    }
    if (!Number.isFinite(duration) || duration <= 0 || duration > 60 || movie.tracks.some(track => !Number.isFinite(track.duration / track.timescale) || track.duration / track.timescale > 60.1)) {
      throw new MediaValidationError("La vidéo doit durer au maximum 60 secondes.");
    }
    const { width, height } = video.video;
    if (width < 1 || height < 1 || width > 4096 || height > 4096) throw new MediaValidationError("La résolution de cette vidéo n’est pas prise en charge.");
    for (const track of movie.tracks) {
      const samples = file.getTrackSamplesInfo(track.id);
      if (!samples?.length || samples.some(sample => !checked.mediaRanges.some(range => sample.size > 0 && sample.offset >= range.start && sample.offset + sample.size <= range.end))) throw new MediaValidationError("Les données de cette vidéo sont incomplètes.");
    }
    return { bytes: checked.bytes, contentType: declaredType, width, height, duration };
  }
  try {
    const image = sharp(bytes, { limitInputPixels: 40_000_000, failOn: "warning", animated: false });
    const meta = await image.metadata();
    const format = { "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp" }[declaredType];
    if (meta.format !== format || !meta.width || !meta.height || (meta.pages ?? 1) > 1 || meta.width > 12000 || meta.height > 12000) throw new Error("format");
    // Decode and re-encode: strip metadata, embedded payloads and orientation ambiguity.
    const pipeline = image.rotate().resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true });
    const clean = await (declaredType === "image/jpeg" ? pipeline.jpeg({ quality: 88 }) : declaredType === "image/png" ? pipeline.png() : pipeline.webp({ quality: 88 })).toBuffer({ resolveWithObject: true });
    if (clean.data.length > imageLimit) throw new Error("size");
    return { bytes: clean.data, contentType: declaredType, width: clean.info.width, height: clean.info.height, duration: null };
  } catch { throw new MediaValidationError("Cette image est invalide. Utilisez une photo JPEG, PNG ou WebP de moins de 10 Mo."); }
}
