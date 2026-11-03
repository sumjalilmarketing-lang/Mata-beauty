/** An email provider acceptance is not proof of inbox delivery. */
export function emailDeliveryLabel(event: unknown, bounce?: { diagnosticCode?: unknown }): string {
  const codes = Array.isArray(bounce?.diagnosticCode) ? bounce.diagnosticCode.filter((value): value is string => typeof value === "string") : [];
  if (["bounced", "email.bounced"].includes(String(event)) && codes.some(code => /550\s+5\.5\.0[\s\S]*mailbox unavailable/i.test(code))) {
    return "Microsoft a refusé le message : boîte destinataire indisponible. Confirmez l’adresse et l’accès à cette boîte avant de renvoyer une invitation.";
  }
  switch (event) {
    case "delivered": case "email.delivered": return "Accepté par le serveur destinataire. Vérifiez aussi les courriers indésirables.";
    case "bounced": case "email.bounced": return "Message rejeté par le serveur destinataire. Vérifiez l’adresse avant de réinviter.";
    case "delivery_delayed": case "email.delivery_delayed": return "Livraison retardée. Le service d’envoi réessaie automatiquement.";
    case "failed": case "email.failed": case "suppressed": case "email.suppressed": return "Le service d’envoi n’a pas pu livrer ce message.";
    case "complained": case "email.complained": return "Le message a été signalé comme indésirable. Ne relancez pas sans accord du destinataire.";
    default: return "Pris en charge par le service d’envoi ; réception non confirmée.";
  }
}
