import { afterEach, describe, expect, it, vi } from "vitest";
import { publicProfileClient } from "@/lib/profiles/public-profile-client";

const mocks = vi.hoisted(() => ({ create: vi.fn(), service: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.create }));
vi.mock("@/lib/payments/server", () => ({ serviceSupabase: mocks.service }));

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("public profile database access", () => {
  it("retains RLS for public catalogs even with a server credential configured", () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-server-key");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "public-test-key");
    publicProfileClient(false);
    expect(mocks.service).not.toHaveBeenCalled();
    expect(mocks.create).toHaveBeenCalledOnce();
  });
  it("keeps public browsing available through RLS without a payment service credential", () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "public-test-key");
    publicProfileClient();
    expect(mocks.service).not.toHaveBeenCalled();
    expect(mocks.create).toHaveBeenCalledWith("https://test.supabase.co", "public-test-key", {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });
  it("preserves the existing configured server path", () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-server-key");
    publicProfileClient();
    expect(mocks.service).toHaveBeenCalledOnce();
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("fails closed when the public configuration is absent", () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    expect(() => publicProfileClient()).toThrow("Configuration Supabase publique absente.");
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
