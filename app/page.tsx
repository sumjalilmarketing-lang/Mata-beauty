import { MataBeautyApp } from "./mata-beauty-app";
import { HomeSeoDirectory } from "./home-seo-directory";
import { Suspense } from "react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ service?: string | string[] }> }) {
  const { service } = await searchParams;
  // Vinext injects these public browser values during the production build.
  return <>
    <MataBeautyApp
      supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}
      supabaseAnonKey={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""}
      initialServiceId={typeof service === "string" ? service : undefined}
    />
    <section className="seo-directory" aria-labelledby="seo-directory-title">
      <div className="seo-directory-inner">
        <p className="seo-directory-eyebrow">MATA BEAUTY · NATIONAL ET INTERNATIONAL</p>
        <h1 id="seo-directory-title">Réservez une prestation beauté près de vous</h1>
        <p className="seo-directory-intro">Découvrez les prestations, les professionnels et les salons publiés sur MATA Beauty. Consultez les informations disponibles et choisissez un créneau depuis la fiche concernée.</p>
        <p className="seo-directory-professional">Vous êtes un professionnel de la beauté ? <Link href="/app/application">Présentez votre activité sur MATA Beauty.</Link></p>
        <Suspense fallback={null}><HomeSeoDirectory /></Suspense>
      </div>
    </section>
  </>;
}
