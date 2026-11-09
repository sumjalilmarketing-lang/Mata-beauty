import { expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { fetchPublishedProviders } from "../../lib/supabase/catalog";

it("bounds the startup catalogue even when a full 100-provider page is returned", async () => {
  let requests = 0;
  const client = createClient("https://test.invalid", "public-test-key", { auth: { persistSession: false }, global: { fetch: async () => {
    requests++;
    if (requests > 1) throw new Error("Unexpected catalogue scan");
    return Response.json(Array.from({ length: 100 }, (_, i) => ({ profile_id: String(i), provider_services: [] })));
  } } });
  expect(await fetchPublishedProviders(client, undefined, undefined, 100)).toEqual([]);
  expect(requests).toBe(1);
});
it("rejects an unbounded or malformed explicit startup window", async () => {
  const client = createClient("https://test.invalid", "public-test-key", { auth: { persistSession: false } });
  for (const limit of [0, -1, NaN, Infinity, 501]) await expect(fetchPublishedProviders(client, undefined, undefined, limit)).rejects.toThrow();
});
