import { authenticatedSupabase } from "@/lib/payments/server";
import { allowedPushEndpoint, pushSubscriptionInput } from "@/lib/push/policy";

const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function GET(request: Request) {
  const auth = await authenticatedSupabase(request);
  if (!auth) return reply({ error: "Connexion requise." }, 401);
  const configured = Boolean(process.env.PUSH_VAPID_PUBLIC_KEY && process.env.PUSH_VAPID_PRIVATE_KEY);
  if (!configured) return reply({ enabled: false });
  const result = await auth.client.from("web_push_subscriptions").select("endpoint,sound").eq("profile_id", auth.user.id);
  if (result.error) return reply({ error: "Notifications momentanément indisponibles." }, 503);
  return reply({ enabled: true, publicKey: process.env.PUSH_VAPID_PUBLIC_KEY, subscriptions: result.data });
}
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return reply({ error: "Origine refusée." }, 403);
  const auth = await authenticatedSupabase(request);
  if (!auth) return reply({ error: "Connexion requise." }, 401);
  if (!process.env.PUSH_VAPID_PUBLIC_KEY || !process.env.PUSH_VAPID_PRIVATE_KEY) return reply({ error: "Activation bientôt disponible." }, 503);
  if (Number(request.headers.get("content-length")) > 5000) return reply({ error: "Requête trop longue." }, 413);
  let body: unknown;
  try { body = await request.json(); } catch { return reply({ error: "Requête invalide." }, 400); }
  const input = pushSubscriptionInput.safeParse(body);
  if (!input.success) return reply({ error: "Abonnement invalide." }, 400);
  const result = await auth.client.rpc("register_web_push", { subscription_endpoint: input.data.endpoint, subscription_keys: input.data.keys, wants_sound: input.data.sound });
  if (result.error) return reply({ error: "Activation impossible. Désactivez les notifications sur cet appareil puis réessayez." }, 409);
  return reply({ ok: true });
}
export async function DELETE(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return reply({ error: "Origine refusée." }, 403);
  const auth = await authenticatedSupabase(request);
  if (!auth) return reply({ error: "Connexion requise." }, 401);
  let endpoint: unknown;
  try { endpoint = (await request.json())?.endpoint; } catch { return reply({ error: "Requête invalide." }, 400); }
  if (typeof endpoint !== "string" || !allowedPushEndpoint(endpoint)) return reply({ error: "Abonnement invalide." }, 400);
  // Owner RLS plus FK cascade also cancels pending deliveries for this device.
  const result = await auth.client.from("web_push_subscriptions").delete().eq("profile_id", auth.user.id).eq("endpoint", endpoint);
  if (result.error) return reply({ error: "Désactivation impossible. Réessayez." }, 503);
  return reply({ ok: true });
}
