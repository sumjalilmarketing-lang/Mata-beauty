import { expect, it } from "vitest";
import { emailDeliveryLabel } from "@/lib/email/delivery-status";
it("does not mistake acceptance or unknown provider events for inbox delivery", () => {
  for (const event of [undefined, "sent", "email.sent", "future_event"]) expect(emailDeliveryLabel(event)).toContain("réception non confirmée");
  expect(emailDeliveryLabel("delivered")).toContain("serveur destinataire");
  expect(emailDeliveryLabel("bounced")).toContain("rejeté");
  expect(emailDeliveryLabel("delivery_delayed")).toContain("retardée");
  expect(emailDeliveryLabel("suppressed")).toContain("pas pu livrer");
});

it("explains the observed Microsoft mailbox rejection without claiming the whole domain is blocked", () => {
  expect(emailDeliveryLabel("bounced", { diagnosticCode: ["smtp; 550 5.5.0 Requested action not taken: mailbox unavailable (S2017062302)."] })).toContain("boîte destinataire indisponible");
  expect(emailDeliveryLabel("bounced", { diagnosticCode: [null, 123] })).toContain("rejeté");
});
