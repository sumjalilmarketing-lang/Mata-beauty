import { CollaboratorInvitationAccept } from "@/app/collaborator-invitation-accept";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { referrer: "no-referrer" };

export default async function AcceptSalonInvitation({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return <CollaboratorInvitationAccept token={typeof token === "string" ? token : ""} supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""} supabaseAnonKey={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""} />;
}
