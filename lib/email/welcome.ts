import { serviceSupabase } from "../payments/server";

export const welcomeMessage = {
  from: "MATA Beauty <bonjour@mata-beauty.com>",
  subject: "Bienvenue sur MATA Beauty",
  text: "Bienvenue sur MATA Beauty ! Votre compte est créé. Découvrez les professionnels de la beauté, enregistrez vos inspirations et réservez votre prochain rendez-vous sur https://mata-beauty.com. Retrouvez votre profil sur https://mata-beauty.com/app/profile.",
};

// No recipient supplied by a browser. The service-only claim freezes the verified
// account address and serializes requests; Resend deduplicates ambiguous retries.
export async function sendWelcomeEmail(userId: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return "unconfigured" as const;
  const client = serviceSupabase();
  const claim = await client.rpc("claim_welcome_email", { target_user_id: userId });
  if (claim.error) throw new Error("welcome_claim_failed");
  const recipient: unknown = claim.data?.[0]?.recipient;
  if (typeof recipient !== "string") return "skipped" as const;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `welcome-v1-${userId}` },
    body: JSON.stringify({ ...welcomeMessage, to: [recipient] }),
    signal: AbortSignal.timeout(10_000),
  });
  const result: unknown = await response.json();
  if (!response.ok || !result || typeof result !== "object" || !("id" in result) || typeof result.id !== "string") {
    throw new Error("welcome_send_failed");
  }
  const saved = await client.from("welcome_email_deliveries").update({ status: "sent", sent_at: new Date().toISOString(), provider_message_id: result.id }).eq("user_id", userId);
  if (saved.error) throw new Error("welcome_receipt_failed");
  return "sent" as const;
}
