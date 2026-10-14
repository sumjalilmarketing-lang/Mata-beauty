import { getSupabaseBrowserClient, getSupabasePublicMediaClient } from "@/lib/supabase/client";
import { publicProfessionalName } from "@/lib/domain/feed-presentation";

export type FeedPost = {
  id: string; authorId: string; caption: string; videoUrl: string; thumbnailUrl: string | null;
  durationSeconds: number; viewCount: number; likeCount: number; commentCount: number; saveCount: number; shareCount: number;
  publishedAt: string; businessName: string; slug: string; city: string; verified: boolean; avatarUrl: string | null; isSponsored: boolean;
  serviceId: string | null; serviceTitle: string | null; durationMinutes: number | null; priceAmount: number | null; currency: string | null;
  averageRating: number; reviewCount: number; hashtags: string[];
  postType: "video" | "photo" | "before_after" | "promotion" | "availability";
  title: string | null; locationLabel: string | null; availableAt: string | null;
  promotionDiscount: number | null; promotionEndsAt: string | null; promotionSlots: number | null;
  mediaUrls: string[]; featureType: string | null; allowComments: boolean;
};

export type SocialFeedRow = {
  id: string; author_id: string; caption: string; video_url: string; thumbnail_url: string | null; duration_seconds: number | string;
  view_count: number | string; like_count: number | string; comment_count: number | string; save_count: number | string; share_count: number | string;
  published_at: string; business_name: string; slug: string; city: string; verified_at: string | null; avatar_url: string | null; cover_url: string | null;
  is_sponsored: boolean; provider_service_id: string | null; service_title: string | null; duration_minutes: number | null; price_amount: number | null;
  currency: string | null; average_rating: number | string; review_count: number | string; hashtags?: string[]; post_type?: FeedPost["postType"];
  title?: string | null; location_label?: string | null; available_at?: string | null; promotion_discount_percent?: number | string | null;
  promotion_ends_at?: string | null; promotion_slots?: number | null; media_urls?: string[]; feature_type?: string | null;
  allow_comments?: boolean;
  media_items?: Array<{ media_type: string; bucket_id: string; storage_path: string; thumbnail_path: string | null }>;
};

export function mapFeedPost(row: SocialFeedRow): FeedPost {
  return {
    id: row.id, authorId: row.author_id, caption: row.caption, videoUrl: row.video_url, thumbnailUrl: row.thumbnail_url,
    durationSeconds: Number(row.duration_seconds), viewCount: Number(row.view_count), likeCount: Number(row.like_count),
    commentCount: Number(row.comment_count), saveCount: Number(row.save_count), shareCount: Number(row.share_count),
    publishedAt: row.published_at, businessName: publicProfessionalName(row.business_name), slug: row.slug, city: row.city,
    verified: Boolean(row.verified_at), avatarUrl: row.avatar_url ?? row.cover_url, isSponsored: Boolean(row.is_sponsored),
    serviceId: row.provider_service_id, serviceTitle: row.service_title, durationMinutes: row.duration_minutes,
    priceAmount: row.price_amount, currency: row.currency, averageRating: Number(row.average_rating), reviewCount: Number(row.review_count),
    hashtags: Array.isArray(row.hashtags) ? row.hashtags : [], postType: row.post_type ?? "video", title: row.title ?? null,
    locationLabel: row.location_label ?? null, availableAt: row.available_at ?? null,
    promotionDiscount: row.promotion_discount_percent === null || row.promotion_discount_percent === undefined ? null : Number(row.promotion_discount_percent),
    promotionEndsAt: row.promotion_ends_at ?? null, promotionSlots: row.promotion_slots ?? null,
    mediaUrls: Array.isArray(row.media_urls) && row.media_urls.length ? row.media_urls : [row.video_url], featureType: row.feature_type ?? null, allowComments: row.allow_comments !== false,
  };
}

async function usableSignedUrl(bucketId: string, storagePath: string) {
  const supabase = getSupabasePublicMediaClient();
  if (!supabase) return null;
  const { data, error } = await supabase.storage.from(bucketId).createSignedUrl(storagePath, 3600);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

export async function resolvePrivateMedia(row: SocialFeedRow): Promise<SocialFeedRow | null> {
  const privateItems = (row.media_items ?? []).filter((item) => item.bucket_id === "provider-social-media");
  if (!privateItems.length) return row;
  const signedMedia = await Promise.all(privateItems.map((item) => usableSignedUrl(item.bucket_id, item.storage_path)));
  if (signedMedia.some((url) => !url)) return null;
  const primary = privateItems[0];
  const signedThumbnail = primary?.thumbnail_path ? await usableSignedUrl(primary.bucket_id, primary.thumbnail_path) : null;
  return { ...row, video_url: signedMedia[0]!, thumbnail_url: signedThumbnail, media_urls: signedMedia.filter((url): url is string => Boolean(url)) };
}

export async function refreshFeedPostMedia(postId: string): Promise<SocialFeedRow | null> {
  const client = getSupabaseBrowserClient();
  if (!client) return null;
  const { data, error } = await client.from("social_feed").select("*").eq("id", postId).abortSignal(AbortSignal.timeout(15000)).maybeSingle();
  if (error || !data) return null;
  return resolvePrivateMedia(data as SocialFeedRow);
}

