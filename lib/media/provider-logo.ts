import sharp from "sharp";

export const MAX_LOGO_BYTES = 4 * 1024 * 1024;
export const MAX_LOGO_PIXELS = 20_000_000;
const mimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function normalizeProviderLogo(bytes: Uint8Array, mime: string): Promise<Buffer> {
  if (!mimeTypes.has(mime) || bytes.byteLength === 0 || bytes.byteLength > MAX_LOGO_BYTES) throw new Error("invalid_logo");
  const image = sharp(bytes, { limitInputPixels: MAX_LOGO_PIXELS, failOn: "error" });
  const metadata = await image.metadata();
  if (!metadata.format || !["jpeg", "png", "webp"].includes(metadata.format) || !metadata.width || !metadata.height || (metadata.pages ?? 1) > 1) throw new Error("invalid_logo");
  // Decode and re-encode rather than trusting a filename or MIME declaration.
  // Sharp drops EXIF and other metadata by default.
  return image.rotate().resize(1024, 1024, { fit: "inside", withoutEnlargement: true }).webp({ quality: 90 }).toBuffer();
}

export async function readLogoUpload(request: Request): Promise<FormData> {
  const limit = MAX_LOGO_BYTES + 64 * 1024;
  if (Number(request.headers.get("content-length") ?? 0) > limit) throw new Error("too_large");
  const type = request.headers.get("content-type") ?? "";
  if (!type.startsWith("multipart/form-data;")) throw new Error("invalid_form");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("invalid_form");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      length += result.value.byteLength;
      if (length > limit) { await reader.cancel(); throw new Error("too_large"); }
      chunks.push(result.value);
    }
  } finally { reader.releaseLock(); }
  return new Response(Buffer.concat(chunks), { headers: { "Content-Type": type } }).formData();
}
