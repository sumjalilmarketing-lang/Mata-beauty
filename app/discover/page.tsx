import type { Metadata } from "next";
import { MataBeautyApp } from "../mata-beauty-app";

export const metadata: Metadata = { title: "Découvrir", description: "Découvrez les professionnels, salons et prestations beauté sur Mata Beauty." };
export default function DiscoverPage() { return <MataBeautyApp initialScreen="home" supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""} supabaseAnonKey={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""} />; }
