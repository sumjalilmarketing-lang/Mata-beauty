"use client";

import { SuperAdminApp } from "../super-admin";
import "./admin.css";
import "./launch.css";

export default function AdminPage() {
  return (
    <SuperAdminApp
      supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}
      supabaseAnonKey={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""}
    />
  );
}
