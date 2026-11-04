"use client";
import { BookingFeedback } from "./booking-feedback";
export function BookingReview({ bookingId }: { bookingId: string; clientId: string; providerId: string; performer: string | null }) {
 return <BookingFeedback bookingId={bookingId} direction="client_to_provider" />;
}
