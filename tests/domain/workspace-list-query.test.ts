import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { workspaceListQuery, workspacePage, workspaceSearchFilter } from "../../lib/domain/workspace-list-query";

describe("workspace list transport", () => {
  it("requests rows beyond the old 100-row ceiling with an exact count", async () => {
    let sent: URL | undefined;
    let prefer = "";
    const client = createClient("https://test.invalid", "public-test-key", { auth: { persistSession: false }, global: { fetch: async (input, init) => {
      sent = new URL(String(input));
      prefer = new Headers(init?.headers).get("prefer") ?? "";
      return new Response("[]", { headers: { "Content-Type": "application/json", "Content-Range": "100-124/125" } });
    } } });
    const result = await workspaceListQuery(client, { table: "businesses", select: "id,name,city" }, { page: 3, query: "Salon", signal: new AbortController().signal });
    expect(sent?.searchParams.get("offset")).toBe("100");
    expect(sent?.searchParams.get("limit")).toBe("50");
    expect(sent?.searchParams.get("order")).toBe("id.asc");
    expect(sent?.searchParams.get("or")).toContain('name.ilike."%Salon%"');
    expect(prefer).toContain("count=exact");
    expect(result.count).toBe(125);
  });

  it("orders equal timestamps deterministically and uses the correct primary key", async () => {
    let sent: URL | undefined;
    const client = createClient("https://test.invalid", "public-test-key", { auth: { persistSession: false }, global: { fetch: async input => {
      sent = new URL(String(input));
      return new Response("[]", { headers: { "Content-Type": "application/json" } });
    } } });
    await workspaceListQuery(client, { table: "provider_profiles", select: "profile_id,business_name,created_at" }, { page: 1, query: "", signal: new AbortController().signal });
    expect(sent?.searchParams.get("order")).toBe("created_at.desc,profile_id.asc");
  });

  it("bounds malformed pages and supports the short UUID references shown in the UI", () => {
    for (const input of [null, "0", "-1", "NaN", "Infinity", "1.5", "99999999999999999999999"]) expect(workspacePage(input)).toBe(1);
    expect(workspacePage("3")).toBe(3);
    expect(workspaceSearchFilter("bookings", "id,status", "ABC12345")).toBe("and(id.gte.abc12345-0000-0000-0000-000000000000,id.lte.abc12345-ffff-ffff-ffff-ffffffffffff)");
    expect(workspaceSearchFilter("bookings", "id,status", "unknown")).toBe("id.is.null");
    expect(workspaceSearchFilter("financial_audit_log", "id,action", "123")).toContain("id.eq.123");
    expect(workspaceSearchFilter("financial_audit_log", "id,action", "abc123")).not.toContain("id.gte");
  });

  it("keeps punctuation and wildcard input inside quoted literals, without exposing unselected columns", () => {
    const filter = workspaceSearchFilter("businesses", "id,name", 'A%,city.eq.secret)');
    expect(filter).toContain('name.ilike."%A\\\\%,city.eq.secret)%"');
    expect(filter).not.toContain('city.ilike');
    expect(workspaceSearchFilter("businesses", "id,name", 'A"B')).toContain('A\\"B');
  });
});
