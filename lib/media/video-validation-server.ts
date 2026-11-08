import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";
import sharp from "sharp";

export const MAX_STUDIO_VIDEO_BYTES = 100 * 1024 * 1024;
export class InvalidStudioMedia extends Error {}

function run(args: string[], timeout: number, acceptProbeExit = false): Promise<{ stdout: string; stderr: string }> {
  const binary = ffmpegPath;
  if (!binary) throw new Error("Video validator unavailable");
  return new Promise((resolve, reject) => {
    execFile(binary, args, { encoding: "utf8", timeout, killSignal: "SIGKILL", maxBuffer: 256 * 1024 }, (error, stdout, stderr) => {
      // ffmpeg -i without an output deliberately returns 1 after probing.
      if (error && ["ENOENT", "EACCES"].includes(String(error.code))) { reject(new Error("Video validator unavailable")); return; }
      if (error && !(acceptProbeExit && error.code === 1)) reject(new InvalidStudioMedia("Vidéo illisible ou trop complexe. Réessayez avec une version exportée depuis votre téléphone."));
      else resolve({ stdout, stderr });
    });
  });
}
const inputOptions = ["-hide_banner", "-nostdin", "-max_alloc", "67108864", "-protocol_whitelist", "file,pipe", "-format_whitelist", "mov,matroska,webm", "-threads", "1", "-max_pixels", "36000000"];

/** Parse only local MP4/MOV/WebM containers, then decode every video frame. No network protocols. */
export async function validateVideoBytes(bytes: Uint8Array) {
  if (!bytes.length || bytes.length > MAX_STUDIO_VIDEO_BYTES) throw new InvalidStudioMedia("La vidéo dépasse 100 Mo ou est vide.");
  const head = Buffer.from(bytes.subarray(0, 16));
  const iso = ["ftyp", "moov", "mdat", "wide", "free"].includes(head.toString("ascii", 4, 8));
  const webm = head.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  if (!iso && !webm) throw new InvalidStudioMedia("Le fichier envoyé n’est pas une vidéo préparée valide.");
  const dir = await mkdtemp(join(tmpdir(), "mata-video-"));
  try {
    const path = join(dir, "input");
    await writeFile(path, bytes, { mode: 0o600 });
    const probe = await run([...inputOptions, "-i", path], 15_000, true);
    const stream = probe.stderr.split("\n").find(line => /Stream #.*Video:/.test(line));
    const dimensions = stream?.match(/\b(\d{2,5})x(\d{2,5})\b/);
    if (!dimensions) throw new InvalidStudioMedia("Aucune piste vidéo lisible.");
    const width = Number(dimensions[1]), height = Number(dimensions[2]);
    if (width * height > 36_000_000) throw new InvalidStudioMedia("La définition vidéo dépasse la limite acceptée.");
    const rotated = /rotation of -?(90|270)(?:\.0+)? degrees/.test(probe.stderr);
    const aspectRatio = rotated ? height / width : width / height;
    if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) throw new InvalidStudioMedia("Dimensions vidéo invalides.");
    const result = await run(["-v", "error", "-xerror", ...inputOptions, "-i", path, "-map", "0:v:0", "-an", "-sn", "-dn", "-threads", "1", "-progress", "pipe:1", "-nostats", "-f", "null", "-"], 180_000);
    const times = [...result.stdout.matchAll(/^out_time_us=(\d+)$/gm)];
    const frames = [...result.stdout.matchAll(/^frame=(\d+)$/gm)];
    const duration = Number(times.at(-1)?.[1]) / 1_000_000;
    if (!frames.length || Number(frames.at(-1)?.[1]) < 1 || !Number.isFinite(duration) || duration <= 0) throw new InvalidStudioMedia("La durée de la vidéo est illisible.");
    return { duration, aspectRatio, sha256: createHash("sha256").update(bytes).digest("hex") };
  } finally { await rm(dir, { recursive: true, force: true }); }
}

export async function validateThumbnailBytes(bytes: Uint8Array) {
  if (!bytes.length || bytes.length > 5 * 1024 * 1024) throw new InvalidStudioMedia("Miniature vide ou supérieure à 5 Mo.");
  try {
    const image = sharp(bytes, { limitInputPixels: 20_000_000, failOn: "warning" });
    const meta = await image.metadata();
    if (!meta.format || !["jpeg", "png", "webp"].includes(meta.format) || (meta.pages ?? 1) > 1) throw new Error("invalid");
    await image.raw().toBuffer();
    return createHash("sha256").update(bytes).digest("hex");
  } catch { throw new InvalidStudioMedia("La miniature est illisible."); }
}

export async function readBoundedMedia(response: Response, limit: number) {
  if (!response.ok || !response.body) throw new Error("Media download unavailable");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const item = await reader.read();
      if (item.done) break;
      size += item.value.byteLength;
      if (size > limit) { await reader.cancel(); throw new InvalidStudioMedia("Fichier trop volumineux."); }
      chunks.push(item.value);
    }
    return Buffer.concat(chunks, size);
  } finally { reader.releaseLock(); }
}
