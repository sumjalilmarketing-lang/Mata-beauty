import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";

const siteUrl = "https://mata-beauty.com";

export const dynamic = "force-dynamic";

type PublicProfileRow = { profile_id: string; slug: string | null };
type PublicServiceRow = { id: string };
type PublicSalonRow = { owner_id: string; slug: string | null };

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [
    { url: siteUrl, changeFrequency: "daily", priority: 1 },
  ];
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return entries;

  try {
    const client = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
    const [profiles, salons, services] = await Promise.all([
      client.from("provider_profiles").select("profile_id,slug").eq("status", "approved").not("slug", "is", null).order("profile_id").limit(5000),
      client.from("businesses").select("owner_id,slug").eq("status", "approved").eq("is_active", true).is("archived_at", null).not("slug", "is", null).order("owner_id").limit(5000),
      client.from("provider_services").select("id,provider_profiles!inner(status)").eq("is_active", true).is("archived_at", null).eq("provider_profiles.status", "approved").order("id").limit(5000),
    ]);

    const profileRows = !profiles.error && Array.isArray(profiles.data) ? profiles.data as unknown as PublicProfileRow[] : [];
    const approvedProviderIds = new Set(profileRows.map(profile => profile.profile_id));
    if (profileRows.length) {
      for (const profile of profileRows) {
        if (profile.slug) entries.push({ url: `${siteUrl}/professional/${encodeURIComponent(profile.slug)}`, changeFrequency: "weekly", priority: 0.7 });
      }
    }
    if (!salons.error && Array.isArray(salons.data)) {
      for (const salon of (salons.data as unknown as PublicSalonRow[]).filter(row => approvedProviderIds.has(row.owner_id))) {
        if (salon.slug) entries.push({ url: `${siteUrl}/salons/${encodeURIComponent(salon.slug)}`, changeFrequency: "weekly", priority: 0.7 });
      }
    }
    if (!services.error && Array.isArray(services.data)) {
      for (const service of services.data as unknown as PublicServiceRow[]) {
        entries.push({ url: `${siteUrl}/service/${encodeURIComponent(service.id)}`, changeFrequency: "weekly", priority: 0.6 });
      }
    }
  } catch {
    // Keep the sitemap valid when the public catalog is temporarily unavailable.
  }

  return [...new Map(entries.map((entry) => [entry.url, entry])).values()];
}
