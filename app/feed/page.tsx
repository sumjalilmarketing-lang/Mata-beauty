import type { Metadata } from "next";
import { MataBeautyApp } from "../mata-beauty-app";

export const metadata: Metadata = {
  title: "Inspiration vidéo",
  description: "Découvrez les vidéos, prestations et professionnels Mata Beauty.",
};

export default function FeedPage() {
  return (
    <MataBeautyApp
      supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}
      supabaseAnonKey={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""}
      initialScreen="feed"
    />
  );
}
