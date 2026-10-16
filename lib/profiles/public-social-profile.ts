import "server-only";

import { serviceSupabase } from "@/lib/payments/server";
import { resolveSocialProfileVideoMedia } from "@/lib/profiles/social-profile-video-media";

export type SocialProfileKind = "client" | "professional" | "salon";
export type SocialProfilePost = {
  id: string;
  caption: string;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  postType: string;
  viewCount: number;
  publishedAt: string;
  authorSlug: string | null;
  authorName: string | null;
  serviceId: string | null;
};
export type SocialProfileService = {
  id: string;
  title: string;
  description: string | null;
  durationMinutes: number;
  priceAmount: number;
  currency: string | null;
};
export type SocialProfileReview = { id: string; rating: number; comment: string | null; providerReply: string | null; createdAt: string };
export type SocialProfileLink = { slug: string; name: string; city: string | null };
export type PublicSocialProfileData = {
  kind: SocialProfileKind;
  id: string;
  slug: string;
  name: string;
  handle: string;
  bio: string | null;
  city: string | null;
  area: string | null;
  address: string | null;
  avatarUrl: string | null;
  coverUrl: string | null;
  verified: boolean;
  specialties: string[];
  rating: number | null;
  reviewCount: number;
  followersCount: number | null;
  followingCount: number | null;
  videoCount: number;
  favoritesCount: number | null;
  posts: SocialProfilePost[];
  favorites: SocialProfilePost[];
  following: SocialProfileLink[];
  services: SocialProfileService[];
  reviews: SocialProfileReview[];
  salon: SocialProfileLink | null;
  isOwner: boolean;
  canShowFollows: boolean;
  canShowCollections: boolean;
};

type ProviderRow = {
  profile_id: string;
  business_name: string;
  slug: string;
  bio: string | null;
  city: string | null;
  cover_url: string | null;
  average_rating: number | string;
  review_count: number;
  verified_at: string | null;
};
type BusinessRow = {
  id: string;
  owner_id: string;
  slug: string;
  name: string;
  description: string | null;
  city: string | null;
  area: string | null;
  address: string | null;
  cover_url: string | null;
  logo_url: string | null;
};
type FeedRow = {
  id: string;
  author_id: string;
  caption: string;
  video_url: string;
  thumbnail_url: string | null;
  view_count: number | string;
  published_at: string;
  business_name: string;
  slug: string;
  post_type: string;
  provider_service_id: string | null;
  media_items: Array<{ media_type: string; bucket_id: string; storage_path: string; thumbnail_path: string | null }> | null;
};
type ServiceRow = { id: string; title: string; description: string | null; duration_minutes: number; price_amount: number; currency: string | null };
type ReviewRow = { id: string; rating: number; comment: string | null; provider_reply: string | null; created_at: string };

function safeHttpUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function publicHandle(candidate: string | null | undefined, displayName: string) {
  const normalized = candidate?.trim();
  if (normalized && !/^(?:provider|salon|business)-[0-9a-f-]{12,}$/i.test(normalized)) return "@" + normalized;
  const fallback = displayName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return "@" + (fallback || "mata-beauty");
}

async function signMedia(bucket: string, path: string | null | undefined) {
  if (!path) return null;
  const { data, error } = await serviceSupabase().storage.from(bucket).createSignedUrl(path, 3600);
  return error ? null : safeHttpUrl(data.signedUrl);
}

async function publicPosts(providerId: string, author: SocialProfileLink): Promise<SocialProfilePost[]> {
  const { data, error } = await serviceSupabase().from("social_feed")
    .select("id,author_id,caption,video_url,thumbnail_url,view_count,published_at,business_name,slug,post_type,provider_service_id,media_items")
    .eq("author_id", providerId).eq("post_type", "video").order("published_at", { ascending: false }).limit(60);
  if (error) throw error;
  const rows = (data ?? []) as unknown as FeedRow[];
  return Promise.all(rows.map(async row => {
    const media = resolveSocialProfileVideoMedia({ videoUrl: row.video_url, thumbnailUrl: row.thumbnail_url, mediaItems: row.media_items });
    const signedVideoPath = media.videoBucket === "provider-social-media" ? media.videoPath : null;
    const signedThumbnailPath = media.thumbnailBucket === "provider-social-media" ? media.thumbnailPath : null;
    const [videoUrl, thumbnailUrl] = await Promise.all([
      signedVideoPath ? signMedia("provider-social-media", signedVideoPath) : Promise.resolve(safeHttpUrl(row.video_url)),
      signedThumbnailPath ? signMedia("provider-social-media", signedThumbnailPath) : Promise.resolve(safeHttpUrl(row.thumbnail_url)),
    ]);
    return {
      id: row.id,
      caption: row.caption ?? "",
      videoUrl,
      thumbnailUrl,
      postType: row.post_type,
      viewCount: Number(row.view_count) || 0,
      publishedAt: row.published_at,
      authorSlug: author.slug,
      authorName: author.name,
      serviceId: row.provider_service_id,
    };
  })).then(items => items.filter(item => item.videoUrl !== null));
}

async function publicPostCount(providerId: string) {
  const { count, error } = await serviceSupabase().from("social_feed")
    .select("id", { count: "exact", head: true }).eq("author_id", providerId).eq("post_type", "video");
  if (error) throw error;
  return count ?? 0;
}

async function specialtiesFor(providerId: string): Promise<string[]> {
  const client = serviceSupabase();
  const links = await client.from("provider_categories").select("category_id").eq("provider_id", providerId).limit(30);
  const ids = ((links.data ?? []) as { category_id: string }[]).map(row => row.category_id);
  if (!ids.length) return [];
  const categories = await client.from("categories").select("name").in("id", ids).eq("is_active", true);
  return ((categories.data ?? []) as { name: string }[]).map(row => row.name);
}

async function followerCounts(providerId: string, viewerId: string | null) {
  const client = serviceSupabase();
  const [{ count: followers }, { count: following }] = await Promise.all([
    client.from("follows").select("follower_id", { count: "exact", head: true }).eq("followed_provider_id", providerId),
    client.from("follows").select("followed_provider_id", { count: "exact", head: true }).eq("follower_id", providerId),
  ]);
  void viewerId;
  return { followers: followers ?? null, following: following ?? null };
}

async function serviceRows(providerId: string, businessId?: string) {
  let query = serviceSupabase().from("provider_services")
    .select("id,title,description,duration_minutes,price_amount,currency")
    .eq("provider_id", providerId).eq("is_active", true).is("archived_at", null).order("title").limit(80);
  if (businessId) query = query.eq("business_id", businessId);
  const { data, error } = await query;
  if (error) return [];
  return ((data ?? []) as ServiceRow[]).map(row => ({
    id: row.id,
    title: row.title,
    description: row.description,
    durationMinutes: row.duration_minutes,
    priceAmount: Number(row.price_amount),
    currency: row.currency,
  }));
}

async function reviewsFor(providerId: string) {
  const { data } = await serviceSupabase().from("reviews")
    .select("id,rating,comment,provider_reply,created_at").eq("provider_id", providerId)
    .eq("is_visible", true).order("created_at", { ascending: false }).limit(12);
  return ((data ?? []) as ReviewRow[]).map(row => ({ id: row.id, rating: row.rating, comment: row.comment, providerReply: row.provider_reply, createdAt: row.created_at }));
}

async function loadProfessional(lookup: string, viewerId: string | null): Promise<PublicSocialProfileData | null> {
  const client = serviceSupabase();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(lookup);
  let query = client.from("provider_profiles").select("profile_id,business_name,slug,bio,city,cover_url,average_rating,review_count,verified_at")
    .eq("status", "approved");
  query = isUuid ? query.eq("profile_id", lookup) : query.eq("slug", lookup.toLowerCase());
  const { data, error } = await query.maybeSingle();
  if (error || !data) return null;
  const provider = data as unknown as ProviderRow;
  const [identity, posts, services, reviews, counts, videoCount, businessResult, specialties] = await Promise.all([
    client.from("profiles").select("avatar_url,username").eq("id", provider.profile_id).maybeSingle(),
    publicPosts(provider.profile_id, { slug: provider.slug, name: provider.business_name, city: provider.city }),
    serviceRows(provider.profile_id),
    reviewsFor(provider.profile_id),
    followerCounts(provider.profile_id, viewerId),
    publicPostCount(provider.profile_id),
    client.from("businesses").select("slug,name,city").eq("owner_id", provider.profile_id).eq("status", "approved").eq("is_active", true).is("archived_at", null).order("created_at").limit(1).maybeSingle(),
    specialtiesFor(provider.profile_id),
  ]);
  const salon = businessResult.data as SocialProfileLink | null;
  return {
    kind: "professional", id: provider.profile_id, slug: provider.slug, name: provider.business_name,
    handle: publicHandle(identity.data?.username, provider.business_name),
    bio: provider.bio, city: provider.city, area: null, address: null,
    avatarUrl: safeHttpUrl(identity.data?.avatar_url), coverUrl: safeHttpUrl(provider.cover_url),
    verified: Boolean(provider.verified_at), specialties,
    rating: Number(provider.average_rating) || 0, reviewCount: Number(provider.review_count) || 0,
    followersCount: counts.followers, followingCount: counts.following, videoCount,
    favoritesCount: null,
    posts, favorites: [], following: [], services, reviews,
    salon: salon ? { slug: salon.slug, name: salon.name, city: salon.city } : null,
    isOwner: viewerId === provider.profile_id, canShowFollows: true, canShowCollections: false,
  };
}

async function loadSalon(lookup: string, viewerId: string | null): Promise<PublicSocialProfileData | null> {
  const client = serviceSupabase();
  const { data, error } = await client.from("businesses").select("id,owner_id,slug,name,description,city,area,address,cover_url,logo_url")
    .eq("slug", lookup.toLowerCase()).eq("status", "approved").eq("is_active", true).is("archived_at", null).maybeSingle();
  if (error || !data) return null;
  const business = data as unknown as BusinessRow;
  const providerResult = await client.from("provider_profiles").select("profile_id,slug,average_rating,review_count,verified_at")
    .eq("profile_id", business.owner_id).eq("status", "approved").maybeSingle();
  if (providerResult.error || !providerResult.data) return null;
  const provider = providerResult.data as { profile_id: string; slug: string; average_rating: number | string; review_count: number; verified_at: string | null };
  const [posts, services, reviews, counts, videoCount, specialties] = await Promise.all([
    publicPosts(provider.profile_id, { slug: provider.slug, name: business.name, city: business.city }),
    serviceRows(provider.profile_id, business.id),
    reviewsFor(provider.profile_id),
    followerCounts(provider.profile_id, viewerId),
    publicPostCount(provider.profile_id),
    specialtiesFor(provider.profile_id),
  ]);
  return {
    kind: "salon", id: provider.profile_id, slug: business.slug, name: business.name, handle: publicHandle(business.slug, business.name),
    bio: business.description, city: business.city, area: business.area, address: business.address,
    avatarUrl: safeHttpUrl(business.logo_url), coverUrl: safeHttpUrl(business.cover_url), verified: Boolean(provider.verified_at), specialties,
    rating: Number(provider.average_rating) || 0, reviewCount: Number(provider.review_count) || 0,
    followersCount: counts.followers, followingCount: counts.following, videoCount,
    favoritesCount: null,
    posts, favorites: [], following: [], services, reviews,
    salon: { slug: business.slug, name: business.name, city: business.city },
    isOwner: viewerId === provider.profile_id, canShowFollows: true, canShowCollections: false,
  };
}

async function loadClient(lookup: string, viewerId: string | null, ownerHasClientRole = false): Promise<PublicSocialProfileData | null> {
  const isOwnerId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(lookup) && viewerId === lookup;
  if (!isOwnerId && !/^[a-zA-Z0-9_]{3,30}$/.test(lookup)) return null;
  const client = serviceSupabase();
  let query = client.from("profiles").select("id,username,display_name,avatar_url,bio,role,is_suspended");
  if (!(isOwnerId && ownerHasClientRole)) query = query.eq("role", "client");
  query = isOwnerId ? query.eq("id", lookup) : query.ilike("username", lookup);
  const { data, error } = await query.maybeSingle();
  if (error || !data || data.is_suspended) return null;
  const profile = data as { id: string; username: string | null; display_name: string | null; avatar_url: string | null; bio: string | null; role: string; is_suspended: boolean };
  const isOwner = viewerId === profile.id;
  const privacyResult = await client.from("profile_privacy_settings").select("profile_visibility,show_collections,show_follows")
    .eq("profile_id", profile.id).maybeSingle();
  const privacy = privacyResult.data as { profile_visibility: string; show_collections: boolean; show_follows: boolean } | null;
  if (!isOwner && privacy?.profile_visibility !== "public") return null;
  const canShowCollections = isOwner || privacy?.show_collections === true;
  const canShowFollows = isOwner || privacy?.show_follows === true;
  let favorites: SocialProfilePost[] = [];
  let favoritesCount: number | null = null;
  if (canShowCollections) {
    const saves = await client.from("post_saves").select("post_id", { count: "exact" }).eq("profile_id", profile.id).order("created_at", { ascending: false }).limit(24);
    favoritesCount = saves.count ?? (saves.data?.length ?? 0);
    const ids = ((saves.data ?? []) as { post_id: string }[]).map(row => row.post_id);
    if (ids.length) {
      const posts = await Promise.all(ids.map(async id => {
        const { data: row } = await client.from("social_feed").select("id,author_id,caption,video_url,thumbnail_url,view_count,published_at,business_name,slug,post_type,provider_service_id,media_items").eq("id", id).maybeSingle();
        if (!row) return null;
        const author = row as unknown as FeedRow;
        const media = resolveSocialProfileVideoMedia({ videoUrl: author.video_url, thumbnailUrl: author.thumbnail_url, mediaItems: author.media_items });
        const signedVideoPath = media.videoBucket === "provider-social-media" ? media.videoPath : null;
        const signedThumbnailPath = media.thumbnailBucket === "provider-social-media" ? media.thumbnailPath : null;
        const [videoUrl, thumbnailUrl] = await Promise.all([
          signedVideoPath ? signMedia("provider-social-media", signedVideoPath) : Promise.resolve(safeHttpUrl(author.video_url)),
          signedThumbnailPath ? signMedia("provider-social-media", signedThumbnailPath) : Promise.resolve(safeHttpUrl(author.thumbnail_url)),
        ]);
        return { id: author.id, caption: author.caption ?? "", videoUrl, thumbnailUrl, postType: author.post_type, viewCount: Number(author.view_count) || 0, publishedAt: author.published_at, authorSlug: author.slug, authorName: author.business_name, serviceId: author.provider_service_id } satisfies SocialProfilePost;
      }));
      favorites = posts.filter((post): post is NonNullable<typeof post> => post !== null && post.videoUrl !== null);
    }
  }
  let following: SocialProfileLink[] = [];
  let followingCount: number | null = null;
  if (canShowFollows) {
    const links = await client.from("follows").select("followed_provider_id", { count: "exact" }).eq("follower_id", profile.id).limit(60);
    const ids = ((links.data ?? []) as { followed_provider_id: string }[]).map(row => row.followed_provider_id);
    const providers = ids.length ? await client.from("provider_profiles").select("slug,business_name,city,profile_id").in("profile_id", ids).eq("status", "approved") : { data: [], error: null };
    following = ((providers.data ?? []) as { slug: string; business_name: string; city: string | null }[]).map(row => ({ slug: row.slug, name: row.business_name, city: row.city }));
    followingCount = links.count ?? ids.length;
  }
  return {
    kind: "client", id: profile.id, slug: profile.username?.trim() || "client-" + profile.id.slice(0, 8), name: profile.display_name?.trim() || profile.username?.trim() || "Mon profil",
    handle: "@" + (profile.username?.trim() || "client-" + profile.id.slice(0, 8)), bio: profile.bio, city: null, area: null, address: null,
    avatarUrl: safeHttpUrl(profile.avatar_url), coverUrl: null, verified: false, specialties: [], rating: null, reviewCount: 0,
    followersCount: null, followingCount, videoCount: 0, favoritesCount, posts: [], favorites, following, services: [], reviews: [],
    salon: null, isOwner, canShowFollows, canShowCollections,
  };
}

export type OwnClientSocialProfileStatus =
  | "ready"
  | "profile_missing"
  | "not_client"
  | "suspended"
  | "load_failed"
  | "profile_unavailable";

export type OwnClientSocialProfileResult =
  | { status: "ready"; profile: PublicSocialProfileData }
  | { status: Exclude<OwnClientSocialProfileStatus, "ready">; profile: null };

export async function loadOwnClientSocialProfile(profileId: string): Promise<OwnClientSocialProfileResult> {
  try {
    const client = serviceSupabase();
    const [{ data, error }, { data: roles, error: rolesError }] = await Promise.all([
      client.from("profiles").select("id,role,is_suspended").eq("id", profileId).maybeSingle(),
      client.from("account_roles").select("role").eq("profile_id", profileId),
    ]);
    if (error || rolesError) return { status: "load_failed", profile: null };
    if (!data) return { status: "profile_missing", profile: null };
    const owner = data as { id: string; role: string; is_suspended: boolean };
    if (owner.is_suspended) return { status: "suspended", profile: null };
    const ownerHasClientRole = owner.role === "client" || (roles ?? []).some(row => row.role === "customer");
    if (!ownerHasClientRole) return { status: "not_client", profile: null };
    const profile = await loadClient(profileId, profileId, ownerHasClientRole);
    return profile
      ? { status: "ready", profile }
      : { status: "profile_unavailable", profile: null };
  } catch {
    return { status: "load_failed", profile: null };
  }
}

export async function loadPublicSocialProfile(kind: SocialProfileKind, lookup: string, viewerId: string | null) {
  try {
    if (kind === "professional") return await loadProfessional(lookup, viewerId);
    if (kind === "salon") return await loadSalon(lookup, viewerId);
    return await loadClient(lookup, viewerId);
  } catch {
    return null;
  }
}

