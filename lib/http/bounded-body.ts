export class BodyTooLargeError extends Error {
  constructor() {
    super("Request body exceeds the byte limit");
    this.name = "BodyTooLargeError";
  }
}

/** Read UTF-8 exactly as Request.text(), while bounding bytes before decoding. */
export async function readBoundedText(request: Request, maxBytes: number): Promise<string> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) throw new RangeError("Invalid body limit");
  const reader = request.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) return text + decoder.decode();
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new BodyTooLargeError();
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}
