export type PublishedVideoRecord = {
  id: string;
  status: string;
  visibility: string;
  published_at: string | null;
  post_services: Array<{ provider_service_id: string; is_primary: boolean }>;
  social_post_media: Array<{ bucket_id: string; storage_path: string; thumbnail_path: string | null }>;
};

export function validatePublishedVideoDelivery(
  record: PublishedVideoRecord | null,
  expected: { postId: string; serviceId: string; videoPath: string; thumbnailPath: string },
) {
  if (!record || record.id !== expected.postId) return "La publication n’a pas été retrouvée en base.";
  if (record.status !== "published" || record.visibility !== "public" || !record.published_at) {
    return "La publication n’est pas dans un état publiable.";
  }
  if (!record.post_services.some((service) => service.is_primary && service.provider_service_id === expected.serviceId)) {
    return "La prestation associée à la publication est introuvable.";
  }
  const media = record.social_post_media.find((item) => item.bucket_id === "provider-social-media" && item.storage_path === expected.videoPath);
  if (!media || media.thumbnail_path !== expected.thumbnailPath) return "Le média publié n’est pas relié à la publication.";
  return null;
}
