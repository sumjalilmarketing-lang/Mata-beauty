import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Découvrir", description: "Découvrez les professionnels, salons et prestations beauté sur Mata Beauty." };
type DiscoverSearchParams = Record<string, string | string[] | undefined>;

export default async function DiscoverPage({ searchParams }: { searchParams?: Promise<DiscoverSearchParams> }) {
  const legacy = await searchParams;
  const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
  const params = new URLSearchParams();
  const query = first(legacy?.q) ?? first(legacy?.query);
  const category = first(legacy?.category);
  const categoryId = first(legacy?.categoryId);
  const zone = first(legacy?.zone);
  const radius = first(legacy?.radius);
  const providerId = first(legacy?.providerId);
  if (query || category || categoryId || zone || providerId || first(legacy?.screen) === "results") {
    params.set("search", "1");
    params.set("applied", "1");
    if (query) params.set("q", query.slice(0, 120));
    if (category) params.set("category", category.slice(0, 100));
    if (categoryId) params.set("categoryId", categoryId);
    if (zone) params.set("zone", zone.slice(0, 120));
    if (["2", "5", "10", "20"].includes(radius ?? "")) params.set("radius", radius!);
    if (providerId) params.set("providerId", providerId);
  }
  redirect(params.size ? `/?${params.toString()}` : "/");
}
