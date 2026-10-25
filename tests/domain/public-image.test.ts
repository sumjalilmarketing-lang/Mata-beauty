import { describe, expect, it } from "vitest";
import { publicMetadataImage } from "@/lib/public-image";

describe("publicMetadataImage", () => {
  it("uses the existing social card when an image is absent", () => {
    expect(publicMetadataImage(null)).toBe("https://mata-beauty.com/og.png");
  });

  it("keeps stable HTTPS images", () => {
    expect(publicMetadataImage("https://mata-beauty.com/images/profile.webp")).toBe("https://mata-beauty.com/images/profile.webp");
    expect(publicMetadataImage("https://project.supabase.co/storage/v1/object/public/avatars/profile.webp")).toBe("https://project.supabase.co/storage/v1/object/public/avatars/profile.webp");
    expect(publicMetadataImage("https://cdn.example.test/profile.webp")).toBe("https://mata-beauty.com/og.png");
  });

  it("does not expose expiring signed image URLs in metadata", () => {
    expect(publicMetadataImage("https://storage.example.test/image.webp?token=secret")).toBe("https://mata-beauty.com/og.png");
    expect(publicMetadataImage("https://storage.example.test/image.webp?X-Amz-Signature=secret")).toBe("https://mata-beauty.com/og.png");
  });

  it("rejects non-HTTPS images", () => {
    expect(publicMetadataImage("http://example.test/image.webp")).toBe("https://mata-beauty.com/og.png");
  });
});
