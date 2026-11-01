export const passwordPolicyMessage = "Utilisez au moins 12 caractères, avec une minuscule, une majuscule, un chiffre et un symbole.";

// Match the native Supabase password policy; no leaked-password database is emulated.
export function meetsPasswordPolicy(password: string) {
  return password.length >= 12 && /[a-z]/.test(password) && /[A-Z]/.test(password)
    && /[0-9]/.test(password) && /[\x21-\x2f\x3a-\x40\x5b-\x60\x7b-\x7e]/.test(password);
}
