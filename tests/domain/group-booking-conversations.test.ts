import { describe, expect, it } from "vitest";
import { groupBookingConversations, type BookingConversationInput } from "@/lib/messaging/group-booking-conversations";

const clientId = "client-1";
const providerId = "provider-1";
const otherProviderId = "provider-2";

function booking(id: string, provider = providerId, startsAt = "2026-10-01T10:00:00.000Z"): BookingConversationInput {
  return { booking: { id, clientId, providerId: provider, startsAt, status: "confirmed", serviceTitle: "Tresses" } };
}

describe("groupBookingConversations", () => {
  it("groups separate bookings only by the verified participant UUID", () => {
    const first = booking("booking-1");
    const second = booking("booking-2", providerId, "2026-10-03T10:00:00.000Z");
    const homonym = booking("booking-3", otherProviderId, "2026-10-04T10:00:00.000Z");

    const result = groupBookingConversations([first, second, homonym], clientId);

    expect(result).toHaveLength(2);
    expect(result.find(item => item.participantId === providerId)?.bookings.map(item => item.id)).toEqual(["booking-2", "booking-1"]);
    expect(result.find(item => item.participantId === otherProviderId)?.bookings).toHaveLength(1);
  });

  it("keeps group and mismatched membership conversations separate", () => {
    const pair = {
      ...booking("booking-pair"),
      conversation: { id: "conversation-pair", updatedAt: "2026-10-01T12:00:00.000Z", memberIds: [clientId, providerId] },
    } satisfies BookingConversationInput;
    const group = {
      ...booking("booking-group", providerId, "2026-10-02T10:00:00.000Z"),
      conversation: { id: "conversation-group", updatedAt: "2026-10-02T12:00:00.000Z", memberIds: [clientId, providerId, "staff-1"] },
    } satisfies BookingConversationInput;
    const ambiguous = {
      ...booking("booking-ambiguous", providerId, "2026-10-03T10:00:00.000Z"),
      conversation: { id: "conversation-ambiguous", updatedAt: "2026-10-03T12:00:00.000Z", memberIds: [clientId, "different-provider"] },
    } satisfies BookingConversationInput;

    const result = groupBookingConversations([pair, group, ambiguous], clientId);

    expect(result).toHaveLength(3);
    expect(result.find(item => item.key === "participant:provider-1")?.conversationIds).toEqual(["conversation-pair"]);
    expect(result.find(item => item.key === "participant:provider-1")?.existingConversationOnly).toBe(false);
    expect(result.find(item => item.key === "conversation:conversation-group")?.isGroup).toBe(true);
    expect(result.find(item => item.key === "conversation:conversation-group")?.existingConversationOnly).toBe(true);
    expect(result.find(item => item.key === "conversation:conversation-ambiguous")?.participantId).toBeNull();
    expect(result.find(item => item.key === "conversation:conversation-ambiguous")?.existingConversationOnly).toBe(true);
  });

  it("keeps an existing conversation's real activity ahead of a later appointment date", () => {
    const oldMessage = {
      ...booking("booking-old", providerId, "2026-10-01T10:00:00.000Z"),
      conversation: {
        id: "conversation-old",
        updatedAt: "2026-10-02T10:00:00.000Z",
        memberIds: [clientId, providerId],
        latestMessage: { body: "À bientôt", createdAt: "2026-10-02T10:00:00.000Z", senderId: providerId },
      },
    } satisfies BookingConversationInput;
    const futureBooking = booking("booking-future", providerId, "2026-10-20T10:00:00.000Z");

    const [result] = groupBookingConversations([futureBooking, oldMessage], clientId);

    expect(result.latestActivityAt).toBe("2026-10-02T10:00:00.000Z");
    expect(result.preview).toBe("À bientôt");
  });

  it("does not merge bookings when the current user is not a participant", () => {
    expect(groupBookingConversations([booking("booking-foreign")], "someone-else")).toHaveLength(1);
    expect(groupBookingConversations([booking("booking-foreign")], "someone-else")[0].participantId).toBeNull();
  });
});
