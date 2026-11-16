import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ring = readFileSync("app/profile-story-ring.tsx", "utf8");
const publicProfile = readFileSync("app/public-social-profile.tsx", "utf8");
const feed = readFileSync("app/social-feed.tsx", "utf8");
const app = readFileSync("app/mata-beauty-app.tsx", "utf8");
const messages = readFileSync("app/workspace-messaging.tsx", "utf8");
const workspaceAvatar = readFileSync("app/workspace-profile-avatar.tsx", "utf8");

describe("profile status rings across MATA Beauty", () => {
  it("uses the public approved-provider story endpoint and honors expiry", () => {
    expect(ring).toContain("/api/public/stories?providers=");
    expect(ring).toContain("Date.parse(item.expiresAt)");
    expect(ring).toContain("cached");
  });
  it("does not change navigation of profiles without a story", () => {
    expect(ring).toContain("else onOpenProfile?.()");
  });
  it("shows an accessible full-screen story viewer", () => {
    expect(ring).toContain('role="dialog"');
    expect(ring).toContain("aria-modal");
    expect(ring).toContain("Voir le profil et réserver");
  });
  it("integrates with public salon and professional avatars, feed and catalog", () => {
    expect(publicProfile).toContain('profile.kind === "client" ?');
    expect(publicProfile).toContain("<ProfileStoryRing providerId={profile.id}");
    expect(feed).toContain('className="creator-orb" providerId={post.authorId}');
    expect(app).toContain("providerId={provider.profileId}");
  });
  it("integrates with conversation contact avatars without nesting buttons", () => {
    expect(messages).toContain("<ProfileStoryRing providerId={contact.participantId}");
    expect(messages).toContain("Ouvrir la conversation avec");
    expect(workspaceAvatar).toContain("<ProfileStoryRing providerId={userId}");
  });
});
