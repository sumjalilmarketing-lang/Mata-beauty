import { privateMetadata } from "@/lib/metadata/private";
export const dynamic = "force-dynamic";
export const metadata = { ...privateMetadata, title: "Mon compte — Mata Beauty" };
import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabasePageClient } from "@/lib/supabase/server";
import { AccountSettings } from "./settings";
import "@/app/workspace.css";
import "@/app/staff-workspace.css";
export default async function AccountSettingsPage() {
  const client = await createSupabasePageClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) redirect("/?connexion=requise&returnTo=%2Faccount%2Fsettings");
  return <main className="workspace-layout workspace-staff"><section className="workspace-main"><Link href="/">Accueil</Link><h1>Mon profil et mes paramètres</h1><AccountSettings userId={user.id} /></section></main>;
}
