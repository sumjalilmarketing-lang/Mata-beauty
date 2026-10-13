"use client";

import { ConversationMessages } from "./conversation-messages";

/** Preserve the appointment entry points while sharing the same conversation UI. */
export function BookingMessages(props: { bookingId: string; serviceTitle: string; userId: string; onClose: () => void; requestedMessageId?: string | null; canReply?: boolean }) {
  return <ConversationMessages {...props} />;
}
