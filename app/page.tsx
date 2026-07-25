import { MataBeautyApp } from "./mata-beauty-app";

export default function Home() {
  // Vinext injects these public browser values during the production build.
  return (
    <MataBeautyApp
      supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}
      supabaseAnonKey={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""}
    />
  );
}
