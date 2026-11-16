import { serviceSupabase } from "@/lib/payments/server";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const db = serviceSupabase();
    const requested = new URL(request.url).searchParams.get("providers");
    const providerIds = requested === null ? null : [...new Set(requested.split(","))]
      .filter(id => /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)).slice(0, 80);
    if (providerIds?.length === 0) return Response.json({ stories: [], profiles: [] });
    const now = new Date().toISOString();
    const query = db.from("professional_stories")
      .select("id,provider_id,media_path,media_type,caption,created_at,expires_at")
      .gt("expires_at", now).order("created_at", { ascending: false }).limit(80);
    const { data, error } = await (providerIds ? query.in("provider_id", providerIds) : query);
    if (error) throw error;
    const posts = data ?? [];
    const ids = providerIds ?? [...new Set(posts.map(item => item.provider_id))];
    if (!ids.length) return Response.json({ stories: [] }, { headers: { "Cache-Control": "no-store" } });
    const approved = await db.from("provider_profiles")
      .select("profile_id,business_name,cover_url,city,country_code")
      .eq("status", "approved").in("profile_id", ids);
    if (approved.error) throw approved.error;
    if (!approved.data?.length) return Response.json({ stories: [], profiles: [] });
    const { data: avatars, error: avatarError } = await db.from("profiles")
      .select("id,avatar_url").in("id", (approved.data ?? []).map(profile => profile.profile_id));
    if (avatarError) throw avatarError;
    const photos = new Map((avatars ?? []).map(profile => [profile.id, profile.avatar_url]));
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
        avatar: photos.get(owner.profile_id) || owner.cover_url, city: owner.city, countryCode: owner.country_code,
        mediaType: item.media_type, caption: item.caption, createdAt: item.created_at,
        expiresAt: item.expires_at, url: signed.data.signedUrl,
      };
    }));
    return Response.json({ stories: stories.filter(Boolean), profiles: (approved.data ?? []).map(profile => ({ providerId: profile.profile_id, name: profile.business_name, avatar: photos.get(profile.profile_id) || profile.cover_url })) },
      { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return Response.json({ stories: [], error: "stories_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
