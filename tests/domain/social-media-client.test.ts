import { afterEach, describe, expect, it } from "vitest";
import { configureSupabaseBrowserClient, getSupabaseBrowserClient, getSupabasePublicMediaClient } from "@/lib/supabase/client";

describe("public social-media signing client", () => {
  afterEach(() => configureSupabaseBrowserClient({ url: "", anonKey: "" }));

  it("does not reuse or persist an authenticated browser session", async () => {
    configureSupabaseBrowserClient({ url: "https://qa.example.supabase.co", anonKey: "test-publishable-key" });
    const appClient = getSupabaseBrowserClient();
    const mediaClient = getSupabasePublicMediaClient();

    expect(mediaClient).not.toBeNull();
    expect(mediaClient).not.toBe(appClient);
    await expect(mediaClient!.auth.getSession()).resolves.toMatchObject({ data: { session: null } });
  });
});
