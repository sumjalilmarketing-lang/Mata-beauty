import { createClient } from "@supabase/supabase-js";
import { expect, it } from "vitest";
import { loadClientReviewBookings } from "../../lib/domain/review-bookings";
it("lists only the current client's completed appointments with stable pagination", async () => {
 let sent: URL | undefined;
 const client = createClient("https://test.invalid", "public-key", { auth: { persistSession: false }, global: { fetch: async input => { sent = new URL(String(input)); return Response.json([]); } } });
 await loadClientReviewBookings(client, "client-id", 2, new AbortController().signal);
 expect(sent?.searchParams.get("client_id")).toBe("eq.client-id");
 expect(sent?.searchParams.get("status")).toBe("eq.completed");
 expect(sent?.searchParams.get("order")).toBe("starts_at.desc,id.desc");
 expect(sent?.searchParams.get("offset")).toBe("40");
 expect(sent?.searchParams.get("limit")).toBe("21");
});
