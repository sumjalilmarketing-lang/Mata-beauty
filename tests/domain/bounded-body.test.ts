import { describe, expect, it } from "vitest";
import { BodyTooLargeError, readBoundedText } from "@/lib/http/bounded-body";

const requestFor = (body: BodyInit) => new Request("https://example.test/webhook", { method: "POST", body, duplex: "half" } as RequestInit);

describe("bounded request bodies", () => {
  it("preserves raw signature text across split UTF-8 characters", async () => {
    const raw = '\ufeff{"message":"é 😀", "spacing":  true}\r\n';
    const bytes = new TextEncoder().encode(raw);
    let index = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (index === bytes.length) controller.close();
        else controller.enqueue(bytes.slice(index, ++index));
      },
    });
    const expected = await requestFor(raw).text();
    expect(await readBoundedText(requestFor(stream), bytes.length)).toBe(expected);
  });

  it("accepts an exact byte boundary and an empty body", async () => {
    expect(await readBoundedText(requestFor("abcd"), 4)).toBe("abcd");
    expect(await readBoundedText(new Request("https://example.test"), 0)).toBe("");
  });

  it("counts bytes, not characters, regardless of Content-Length", async () => {
    const request = requestFor("ééé");
    request.headers.set("content-length", "1");
    await expect(readBoundedText(request, 5)).rejects.toBeInstanceOf(BodyTooLargeError);
  });

  it("cancels an oversized stream before consuming remaining chunks", async () => {
    let cancelled = false;
    let pulls = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) { pulls++; controller.enqueue(new Uint8Array(10)); },
      cancel() { cancelled = true; },
    }, { highWaterMark: 0 });
    await expect(readBoundedText(requestFor(stream), 15)).rejects.toBeInstanceOf(BodyTooLargeError);
    expect(cancelled).toBe(true);
    expect(pulls).toBe(2);
  });
});
