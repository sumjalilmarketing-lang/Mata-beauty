export type BookingConversationInput = {
  booking: {
    id: string;
    clientId: string;
    providerId: string;
    startsAt: string;
    status: string;
    serviceTitle: string | null;
  };
  conversation?: {
    id: string;
    updatedAt: string;
    memberIds: string[];
    unreadCount?: number;
    latestMessage?: { body: string; createdAt: string; senderId: string };
  };
};

export type GroupedBookingConversation = {
  key: string;
  participantId: string | null;
  isGroup: boolean;
  existingConversationOnly: boolean;
  conversationIds: string[];
  bookings: BookingConversationInput["booking"][];
  latestActivityAt: string;
  preview: string | null;
  unreadCount: number;
};

/**
 * Groups only booking threads that are proven to be a private two-person
 * conversation between the signed-in user and the booking's other participant.
 * Group/ambiguous conversations stay separate; display names are never keys.
 */
export function groupBookingConversations(
  rows: BookingConversationInput[],
  userId: string,
): GroupedBookingConversation[] {
  const privateByParticipant = new Map<string, GroupedBookingConversation>();
  const participantHasConversation = new Set<string>();
  const separateGroups: GroupedBookingConversation[] = [];

  for (const row of rows) {
    const { booking, conversation } = row;
    const participantId = booking.clientId === userId
      ? booking.providerId
      : booking.providerId === userId
        ? booking.clientId
        : null;
    const members = conversation?.memberIds ?? [];
    const isPrivatePair = !conversation || (
      members.length === 2 && members.includes(userId) && participantId !== null && members.includes(participantId)
    );

    if (!isPrivatePair || !participantId) {
      separateGroups.push({
        key: `conversation:${conversation?.id ?? booking.id}`,
        participantId: null,
        isGroup: Boolean(conversation && members.length > 2),
        existingConversationOnly: Boolean(conversation),
        conversationIds: conversation ? [conversation.id] : [],
        bookings: [booking],
        latestActivityAt: conversation?.latestMessage?.createdAt ?? conversation?.updatedAt ?? booking.startsAt,
        preview: conversation?.latestMessage?.body ?? null,
        unreadCount: conversation?.unreadCount ?? 0,
      });
      continue;
    }

    let group = privateByParticipant.get(participantId);
    if (!group) {
      group = {
        key: `participant:${participantId}`,
        participantId,
        isGroup: false,
        existingConversationOnly: false,
        conversationIds: [],
        bookings: [],
        latestActivityAt: booking.startsAt,
        preview: null,
        unreadCount: 0,
      };
      privateByParticipant.set(participantId, group);
    }
    group.bookings.push(booking);
    group.unreadCount += conversation?.unreadCount ?? 0;
    if (conversation && !group.conversationIds.includes(conversation.id)) group.conversationIds.push(conversation.id);
    const activityAt = conversation?.latestMessage?.createdAt ?? conversation?.updatedAt ?? booking.startsAt;
    const hasConversation = Boolean(conversation);
    const hasPriorConversation = participantHasConversation.has(participantId);
    if (hasConversation && !hasPriorConversation) {
      participantHasConversation.add(participantId);
      group.latestActivityAt = activityAt;
      group.preview = conversation?.latestMessage?.body ?? null;
    } else if ((hasConversation || !hasPriorConversation) && activityAt > group.latestActivityAt) {
      group.latestActivityAt = activityAt;
      group.preview = conversation?.latestMessage?.body ?? null;
    }
  }

  return [...privateByParticipant.values(), ...separateGroups]
    .map(group => ({
      ...group,
      bookings: [...group.bookings].sort((a, b) => b.startsAt.localeCompare(a.startsAt)),
      conversationIds: [...group.conversationIds],
    }))
    .sort((a, b) => b.latestActivityAt.localeCompare(a.latestActivityAt));
}
