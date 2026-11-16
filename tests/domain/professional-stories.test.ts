import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261116090000_professional_stories.sql", "utf8");
const route = readFileSync("app/api/public/stories/route.ts", "utf8");
const cron = readFileSync("app/api/cron/prune-stories/route.ts", "utf8");
const viewer = readFileSync("app/professional-stories.tsx", "utf8");

describe("24-hour professional statuses", () => {
  it("uses a private bucket and never exposes service keys to the browser", () => {
    expect(migration).toMatch(/'professional-stories',\s*'professional-stories',\s*false/);
    expect(viewer).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });
  it("permits only approved professional owners to publish", () => {
    expect(migration).toMatch(/provider_id = auth\.uid\(\)/);
    expect(migration).toMatch(/p\.status = 'approved'/);
    expect(migration).toMatch(/storage\.foldername\(name\)/);
  });
  it("never returns expired statuses and creates temporary signed URLs", () => {
    expect(route).toContain('.gt("expires_at", now)');
    expect(route).toContain("createSignedUrl");
    expect(route).toContain("Math.min(120, remaining)");
  });
  it("requires authorization to purge expired media", () => {
    expect(cron).toContain("CRON_SECRET");
    expect(cron).toContain('remove([story.media_path])');
    expect(cron).toContain("timingSafeEqual");
  });
  it("keeps the creator flow one-tap with a 30-second video limit", () => {
    expect(viewer).toContain('fileInput.current?.click()');
    expect(viewer).toContain("MAX_VIDEO_SECONDS = 30");
    expect(viewer).toContain("Publier · 24 h");
  });
});
