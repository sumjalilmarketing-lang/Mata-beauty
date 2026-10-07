"use client";
import { SuperAdminApp } from "../../super-admin";
import "../admin.css";
import "../launch.css";

export default function TeamPage() {
  return <SuperAdminApp initialModule="administrators" supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""} supabaseAnonKey={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""} />;
}
