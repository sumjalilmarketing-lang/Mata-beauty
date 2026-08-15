type AuthErrorLike = { code?: string; message?: string; status?: number };

export function authErrorMessage(error: unknown) {
  const candidate = error && typeof error === "object" ? error as AuthErrorLike : {};
  const code = candidate.code?.toLowerCase() ?? "";
  const message = candidate.message?.toLowerCase() ?? "";

  if (code === "email_not_confirmed" || message.includes("email not confirmed")) {
    return "Votre adresse e-mail doit être confirmée avant la connexion.";
  }
  if (code === "invalid_credentials" || message.includes("invalid login credentials")) {
    return "E-mail ou mot de passe incorrect.";
  }
  if (code === "user_banned" || message.includes("banned") || message.includes("suspend")) {
    return "Votre compte a été suspendu. Contactez l’assistance Mata Beauty.";
  }
  if (code === "over_email_send_rate_limit" || candidate.status === 429) {
    return "Trop de tentatives. Patientez quelques minutes avant de réessayer.";
  }
  if (message.includes("already registered") || code === "user_already_exists") {
    return "Un compte existe déjà avec cette adresse e-mail.";
  }
  if (message.includes("network") || message.includes("fetch")) {
    return "Connexion au service momentanément indisponible. Réessayez.";
  }
  return "La connexion n’a pas pu être finalisée. Réessayez ou contactez l’assistance.";
}
