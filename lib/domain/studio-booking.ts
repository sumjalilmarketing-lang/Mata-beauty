export type StudioBookingService = { id: string; status: string; is_active: boolean; archived_at: string | null };

export function studioServiceIsPublic(service: StudioBookingService | undefined | null) {
  return Boolean(service && service.status === "published" && service.is_active && !service.archived_at);
}

export function studioServiceCanPublish(service: StudioBookingService | undefined | null) {
  return Boolean(service && !service.archived_at && service.status === "draft");
}
