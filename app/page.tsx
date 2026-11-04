import type { Metadata } from "next";
import { MataBeautyApp } from "./mata-beauty-app";
import { HomeSeoDirectory } from "./home-seo-directory";
import { Suspense } from "react";
import Link from "next/link";

const homeMetadata: Metadata = {
  title: "Coiffure et beauté au Sénégal : réservez en ligne",
  description: "Découvrez les professionnels de la coiffure, de l’esthétique, de l’onglerie et du bien-être au Sénégal sur Mata Beauty. Consultez les prestations et les créneaux publiés.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Mata Beauty — Coiffure et beauté au Sénégal",
    description: "Découvrez les salons et professionnels publiés et réservez votre prochain rendez-vous beauté.",
    url: "https://mata-beauty.com/",
    type: "website",
    locale: "fr_SN",
    images: [{ url: "/og.png", width: 1731, height: 908, alt: "Mata Beauty — Coiffure et beauté au Sénégal" }],
  },
};

export async function generateMetadata({searchParams}: {searchParams: Promise<Record<string,string|string[]|undefined>>}): Promise<Metadata> {
  const params=await searchParams;
  const internal=["search","applied","q","category","categoryId","zone","radius","providerId","service","connexion","screen"];
  return {...homeMetadata, robots:{index:!internal.some(key=>Boolean(params[key])),follow:true}};
}

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
        <h1 id="seo-directory-title">Coiffure, esthétique et beauté au Sénégal</h1>
        <p className="seo-directory-intro">Trouvez votre prochain rendez-vous coiffure, tresses, maquillage, onglerie ou bien-être au Sénégal et à l’international. MATA Beauty vous permet de découvrir les professionnels et les salons publiés, de consulter leurs prestations et de choisir parmi les créneaux disponibles. Les services proposés dépendent de chaque professionnel et de sa localisation.</p>
        <p className="seo-directory-professional">Vous êtes un professionnel de la beauté ? <Link href="/app/application">Présentez votre activité sur MATA Beauty.</Link></p>
        <Suspense fallback={null}><HomeSeoDirectory /></Suspense>
      </div>
    </section>
  </>;
}
