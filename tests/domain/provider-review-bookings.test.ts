import { createClient } from "@supabase/supabase-js";
import { expect, it } from "vitest";
import { loadProviderReviewBookings } from "../../lib/domain/provider-review-bookings";
it("loads completed provider appointments with stable pagination and salon ownership", async () => {
  const sent: URL[] = [];
  const client = createClient("https://test.invalid", "public-key", { auth: { persistSession: false }, global: { fetch: async input => {
    const url = new URL(String(input)); sent.push(url);
    return Response.json(url.pathname.endsWith("businesses") ? [{ id: "owned-salon" }] : []);
  } } });
  await loadProviderReviewBookings(client, "provider", 2, new AbortController().signal, "owned-salon");
  expect(sent[0].searchParams.get("owner_id")).toBe("eq.provider");
  expect(sent[1].searchParams.get("status")).toBe("eq.completed");
  expect(sent[1].searchParams.get("or")).toContain("provider_id.eq.provider,business_id.in.(owned-salon)");
  expect(sent[1].searchParams.get("business_id")).toBe("eq.owned-salon");
  expect(sent[1].searchParams.get("order")).toBe("starts_at.desc,id.desc");
  expect(sent[1].searchParams.get("offset")).toBe("40");
  expect(sent[1].searchParams.get("limit")).toBe("21");
});
