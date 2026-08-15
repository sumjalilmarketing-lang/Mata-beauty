type ErrorLike = { code?: unknown; message?: unknown };

/** Convertit une erreur technique en message sûr pour l’interface. */
export function publicErrorMessage(error: unknown, fallback = "L’action n’a pas pu être terminée. Réessayez.") {
  if (!error || typeof error !== "object") return fallback;
  const { code, message } = error as ErrorLike;
  const normalizedCode = typeof code === "string" ? code : "";
  const normalizedMessage = typeof message === "string" ? message.toLocaleLowerCase("fr") : "";

  if (normalizedCode === "23P01") return "Ce créneau vient d’être réservé. Choisissez-en un autre.";
  if (normalizedCode === "23505") return "Cet élément existe déjà.";
  if (normalizedCode === "23503") return "Cette action dépend d’un élément qui n’est plus disponible.";
  if (["42501", "PGRST301"].includes(normalizedCode) || normalizedMessage.includes("row-level security")) return "Vous n’êtes pas autorisé à effectuer cette action.";
  if (normalizedMessage.includes("jwt") || normalizedMessage.includes("session") || normalizedMessage.includes("authentification requise")) return "Votre session a expiré. Reconnectez-vous.";
  if (normalizedMessage.includes("network") || normalizedMessage.includes("fetch")) return "Connexion indisponible. Vérifiez votre réseau et réessayez.";
  return fallback;
}
