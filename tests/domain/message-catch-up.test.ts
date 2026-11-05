import { createClient } from "@supabase/supabase-js";
import { expect, it } from "vitest";
import { loadMessageCatchUp } from "../../lib/messaging/message-catch-up";

it("retrieves every message after reconnecting across three pages without moving the lower bound", async () => {
  const since = "2026-11-05T10:00:00Z";
  const messages = Array.from({ length: 125 }, (_, index) => ({
    id: String(index).padStart(4, "0"), conversation_id: "conversation", sender_id: "client",
    body: `Message ${index}`, created_at: new Date(Date.parse(since) + index * 1000).toISOString(),
  }));
  const requests: URL[] = [];
  const client = createClient("https://test.invalid", "public-key", { auth: { persistSession: false }, global: { fetch: async input => {
    const url = new URL(String(input)); requests.push(url);
    const lower = url.searchParams.get("created_at")!.slice(4);
    const offset = Number(url.searchParams.get("offset"));
    return Response.json(messages.filter(message => Date.parse(message.created_at) >= Date.parse(lower)).slice(offset, offset + 50));
  } } });
  const result = await loadMessageCatchUp(client, ["conversation"], since, new AbortController().signal);
  expect(result.map(message => message.id)).toEqual(messages.map(message => message.id));
  expect(requests.map(url => url.searchParams.get("created_at"))).toEqual(Array(3).fill(`gte.${since}`));
  expect(requests.map(url => url.searchParams.get("order"))).toEqual(Array(3).fill("created_at.asc,id.asc"));
  expect(requests.every(url => url.searchParams.get("deleted_at") === "is.null")).toBe(true);
});

it("rejects a failed catch-up so callers keep their previous cursor and can retry", async () => {
  const client = createClient("https://test.invalid", "public-key", { auth: { persistSession: false }, global: { fetch: async () => Response.json({ message: "offline" }, { status: 400 }) } });
  await expect(loadMessageCatchUp(client, ["conversation"], "2026-11-05T10:00:00Z", new AbortController().signal)).rejects.toBeDefined();
});
