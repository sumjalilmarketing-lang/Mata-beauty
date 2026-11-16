import { serviceSupabase } from "@/lib/payments/server";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const db = serviceSupabase();
    const now = new Date().toISOString();
    const { data, error } = await db.from("professional_stories")
      .select("id,provider_id,media_path,media_type,caption,created_at,expires_at")
      .gt("expires_at", now).order("created_at", { ascending: false }).limit(80);
    if (error) throw error;
    const posts = data ?? [];
    const ids = [...new Set(posts.map(item => item.provider_id))];
    if (!ids.length) return Response.json({ stories: [] }, { headers: { "Cache-Control": "no-store" } });
    const approved = await db.from("provider_profiles")
      .select("profile_id,business_name,cover_url,city,country_code")
      .eq("status", "approved").in("profile_id", ids);
    if (approved.error) throw approved.error;
    const names = new Map((approved.data ?? []).map(item => [item.profile_id, item]));
    const stories = await Promise.all(posts.filter(item => names.has(item.provider_id)).map(async item => {
      const remaining = Math.floor((new Date(item.expires_at).getTime() - Date.now()) / 1000);
      if (remaining < 1) return null;
      const signed = await db.storage.from("professional-stories")
        .createSignedUrl(item.media_path, Math.min(120, remaining));
      if (signed.error || !signed.data?.signedUrl) return null;
      const owner = names.get(item.provider_id)!;
      return {
        id: item.id, providerId: item.provider_id, name: owner.business_name,
        avatar: owner.cover_url, city: owner.city, countryCode: owner.country_code,
        mediaType: item.media_type, caption: item.caption, createdAt: item.created_at,
        expiresAt: item.expires_at, url: signed.data.signedUrl,
      };
    }));
    return Response.json({ stories: stories.filter(Boolean) },
      { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return Response.json({ stories: [], error: "stories_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
