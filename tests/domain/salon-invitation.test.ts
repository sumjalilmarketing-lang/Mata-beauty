import { expect, it } from "vitest";
import { pendingSalonInvitation } from "../../lib/domain/salon-invitation";
import { salonInvitationEmail } from "../../lib/email/salon-invitation";

it("keeps a valid invitation across login and never substitutes an old invitation for an invalid new link", () => {
  const token = "a".repeat(43);
  expect(pendingSalonInvitation(token, null)).toBe(token);
  expect(pendingSalonInvitation(null, token)).toBe(token);
  expect(pendingSalonInvitation("invalid", token)).toBeNull();
  expect(pendingSalonInvitation("", token)).toBeNull();
  expect(pendingSalonInvitation(null, null)).toBeNull();
});
it("makes the email a branded link to a confirmation page, without accepting on link opening", () => {
  const url = "https://mata-beauty.com/salon/invitation/accept#token=" + "a".repeat(43);
  const result = salonInvitationEmail(url, 'Salon <script>alert("x")</script> & beauté');
  expect(result.html).toContain(`href="${url}"`);
  expect(result.html).toContain("Ouvrir l’invitation");
  expect(result.html).toContain("Oui, rejoindre l’équipe");
  expect(result.html).toContain("Non, pas maintenant");
  expect(result.html).not.toContain("<script>");
  expect(result.html).toContain("&lt;script&gt;");
  expect(result.html).not.toContain("/api/salon/invitations/accept");
  expect(result.text).toContain("rien à répondre par email");
});
