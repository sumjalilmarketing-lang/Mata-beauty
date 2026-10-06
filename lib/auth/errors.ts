type AuthErrorLike = { code?: string; message?: string; status?: number; name?: string };

export function authErrorMessage(error: unknown) {
  const candidate = error && typeof error === "object" ? error as AuthErrorLike : {};
  const code = candidate.code?.toLowerCase() ?? "";
  const message = candidate.message?.toLowerCase() ?? "";

  if (["otp_expired", "invalid_email_link", "session_not_found", "refresh_token_not_found", "bad_code_verifier", "flow_state_not_found", "flow_state_expired", "access_denied"].includes(code)
    || candidate.name === "AuthSessionMissingError" || candidate.name === "AuthPKCEGrantCodeExchangeError") {
    return "Ce lien est expiré, déjà utilisé ou ne permet pas de retrouver votre session. Demandez un nouveau lien et ouvrez-le dans le même navigateur.";
  }
  if (code === "same_password") return "Choisissez un mot de passe différent de votre mot de passe actuel.";
  if (code === "weak_password") return "Ce mot de passe est trop faible. Choisissez un mot de passe plus long et unique.";

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
