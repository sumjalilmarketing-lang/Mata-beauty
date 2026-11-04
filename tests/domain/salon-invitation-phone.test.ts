import { expect, it } from "vitest";
import { normalizeInvitationPhone, whatsappSalonInvitation } from "@/lib/domain/salon-invitation-phone";
it("accepts international phone formatting but rejects missing country codes and injected characters", () => {
  expect(normalizeInvitationPhone("00 33 (6) 12-34-56-78")).toBe("+33612345678");
  for (const value of ["770000000", "+221abc770000000", "+012345678", "+22177?text=bad", ""]) expect(normalizeInvitationPhone(value)).toBeNull();
});
it("encodes the personal link into a WhatsApp draft addressed to the invited phone", () => {
  const invite = "https://mata-beauty.com/salon/invitation/accept#token=" + "a".repeat(43);
  const url = new URL(whatsappSalonInvitation("+221770000099", invite)!);
  expect(url.origin).toBe("https://wa.me"); expect(url.pathname).toBe("/221770000099");
  expect(url.searchParams.get("text")).toContain(invite);
  expect(url.hash).toBe("");
});
