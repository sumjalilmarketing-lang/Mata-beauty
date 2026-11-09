import { authenticatedSupabase, jsonError } from "@/lib/payments/server";

export async function GET(request: Request) {
  const auth = await authenticatedSupabase(request);
  if (!auth) return jsonError("Authentification requise.", 401, "UNAUTHENTICATED");
  const { data: profile, error: profileError } = await auth.client.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
  if (profileError) return jsonError("Le profil professionnel n’a pas pu être vérifié.", 503, "PROFILE_READ_FAILED");
  if (profile?.role !== "provider") return jsonError("Accès prestataire requis.", 403, "FORBIDDEN");
  const { data: wallet, error: walletError } = await auth.client.from("wallets").select("id,currency").eq("professional_id", auth.user.id).maybeSingle();
  if (walletError) return jsonError("Le portefeuille n’a pas pu être chargé.", 503, "WALLET_READ_FAILED");
  if (!wallet) return Response.json({ ok: true, balance: { currency: "XOF", pending_balance: 0, available_balance: 0, total_earned: 0, total_paid_out: 0 }, entries: [] }, { headers: { "Cache-Control": "no-store" } });
  const [{ data: balance, error: balanceError }, { data: entries, error: ledgerError }] = await Promise.all([
    auth.client.from("wallet_balances").select("pending_balance,available_balance,total_earned,total_paid_out,currency").eq("wallet_id", wallet.id).single(),
    auth.client.from("wallet_ledger").select("id,payment_id,booking_id,transaction_type,amount,status,reference,created_at").eq("wallet_id", wallet.id).order("created_at", { ascending: false }).limit(100),
  ]);
  if (balanceError || ledgerError) return jsonError("Le portefeuille n’a pas pu être chargé.", 500, "WALLET_READ_FAILED");
  return Response.json({ ok: true, balance, entries }, { headers: { "Cache-Control": "no-store" } });
}
