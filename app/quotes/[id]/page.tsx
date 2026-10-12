import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { createSupabasePageClient } from "@/lib/supabase/server";
import { QuoteBookingPage } from "../../quote-booking";

export const dynamic = "force-dynamic";
export const metadata = { title: "Réserver mon devis — MATA Beauty", robots: { index: false, follow: false } };
export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const client = await createSupabasePageClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) redirect("/?connexion=requise&returnTo=" + encodeURIComponent("/quotes/" + id));
  return <QuoteBookingPage quoteId={id} userId={user.id}
    supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""} supabaseAnonKey={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""} />;
}

