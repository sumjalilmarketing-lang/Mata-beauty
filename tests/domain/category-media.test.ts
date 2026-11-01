import { describe, expect, it } from "vitest";
import { categoryMediaSequence, editorialCategoryMedia, serviceVisual, type CategoryMedia } from "../../lib/catalog/category-media";

describe("exact-category media selection", () => {
  it("never assigns a neighbouring category by display order or an unknown name", () => {
    expect(editorialCategoryMedia("Locks").every(image => image.src.includes("/locks-"))).toBe(true);
    expect(editorialCategoryMedia("Cils et sourcils")[0].categorySlug).toBe("cils-sourcils");
    expect(editorialCategoryMedia("Nouvelle catégorie inconnue")).toEqual([]);
  });
  it("preserves professional provenance and excludes unrelated or unlinked media", () => {
    const real: CategoryMedia = { src: "https://example.com/locks.webp", alt: "Locks", categorySlug: "locks", origin: "professional", providerId: "provider", serviceId: "service", postId: "post" };
    const result = categoryMediaSequence("locks", [real, { ...real, src: "other", categorySlug: "onglerie" }, { ...real, src: "unlinked", serviceId: undefined }]);
    expect(result[0]).toEqual(real);
    expect(result.map(image => image.src)).toEqual([real.src, "/images/categories/locks-1.webp", "/images/categories/locks-2.webp"]);
  });
  it("uses the real service image, then only its category fallback", () => {
    expect(serviceVisual("Locks", "/real-locks.webp")).toBe("/real-locks.webp");
    expect(serviceVisual("Locks")).toBe("/images/categories/locks-1.webp");
    expect(serviceVisual("Unknown")).toBeUndefined();
  });
});
