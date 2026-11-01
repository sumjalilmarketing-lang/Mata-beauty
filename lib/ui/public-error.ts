type ErrorLike = { code?: unknown; message?: unknown };

/** Convertit une erreur technique en message sûr pour l’interface. */
export function publicErrorMessage(error: unknown, fallback = "L’action n’a pas pu être terminée. Réessayez.") {
  if (!error || typeof error !== "object") return fallback;
  const { code, message } = error as ErrorLike;
  const normalizedCode = typeof code === "string" ? code : "";
  const normalizedMessage = typeof message === "string" ? message.toLocaleLowerCase("fr") : "";

  const teamMessages: Record<string, string> = {
    MATA_TEAM_email_unavailable: "Le service d’invitation par e-mail n’est pas configuré. Contactez l’assistance.",
    MATA_TEAM_delivery_failed: "L’e-mail n’a pas pu être envoyé ; l’invitation a été annulée.",
    MATA_TEAM_delivery_receipt_failed: "L’e-mail a été envoyé, mais son reçu n’a pas pu être enregistré. Actualisez les invitations avant tout nouvel envoi.",
    MATA_TEAM_origin_rejected: "L’origine de cette page n’est pas autorisée pour gérer les accès.",
    MATA_TEAM_invitation_create_failed: "L’invitation n’a pas pu être créée. Vérifiez l’adresse, les droits et les invitations en attente.",
    MATA_TEAM_team_access_disabled: "Les invitations collaborateur sont temporairement désactivées.",
    MATA_TEAM_unauthorized: "Votre session a expiré. Reconnectez-vous.",
  };
  if (Object.hasOwn(teamMessages, normalizedCode)) return teamMessages[normalizedCode];

  if (normalizedMessage.includes("mata_anti_circumvention:contact_details")) return "Les coordonnées personnelles ne peuvent pas être partagées ici. Poursuivez vos échanges dans la messagerie MATA Beauty.";

  if (normalizedCode === "23P01") return "Ce créneau vient d’être réservé. Choisissez-en un autre.";
  if (normalizedCode === "23505") return "Cet élément existe déjà.";
  if (normalizedCode === "23503") return "Cette action dépend d’un élément qui n’est plus disponible.";
  if (["42501", "PGRST301"].includes(normalizedCode) || normalizedMessage.includes("row-level security")) return "Vous n’êtes pas autorisé à effectuer cette action.";
  if (normalizedMessage.includes("jwt") || normalizedMessage.includes("session") || normalizedMessage.includes("authentification requise")) return "Votre session a expiré. Reconnectez-vous.";
  if (normalizedMessage.includes("network") || normalizedMessage.includes("fetch")) return "Connexion indisponible. Vérifiez votre réseau et réessayez.";
  return fallback;
}
