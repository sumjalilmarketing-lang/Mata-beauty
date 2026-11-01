import { describe, expect, it } from "vitest";
import { resolveApplicationOrigin } from "../../lib/auth/application-origin";

const preview = {
  VERCEL_ENV: "preview", VERCEL_URL: "mata-beauty-build123-africrm.vercel.app",
  VERCEL_BRANCH_URL: "mata-beauty-git-test-africrm.vercel.app",
  NEXT_PUBLIC_APP_URL: "https://mata-beauty.com",
};

describe("trusted application origins", () => {
  it.each([preview.VERCEL_URL, preview.VERCEL_BRANCH_URL])("preserves auth cookies on the trusted preview host %s", host => {
    expect(resolveApplicationOrigin(`https://${host}/auth/confirm`, preview)).toBe(`https://${host}`);
  });
  it.each(["https://attacker.example", "https://other-project.vercel.app", "https://mata-beauty-git-test-africrm.vercel.app.evil.test", "http://mata-beauty-git-test-africrm.vercel.app", "https://mata-beauty.com"])("refuses an untrusted preview origin: %s", origin => {
    expect(resolveApplicationOrigin(`${origin}/auth/confirm`, preview)).toBe(`https://${preview.VERCEL_URL}`);
  });
  it("uses the canonical production origin", () => {
    expect(resolveApplicationOrigin("https://mata-beauty.vercel.app/auth/confirm", { ...preview, VERCEL_ENV: "production" })).toBe("https://mata-beauty.com");
  });
  it("preserves local development without Vercel configuration", () => {
    expect(resolveApplicationOrigin("http://localhost:3000/auth/confirm", {})).toBe("http://localhost:3000");
  });
});
