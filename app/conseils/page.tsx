import type { Metadata } from "next";
import Link from "next/link";
import {beautyGuideHref,beautyGuides} from "@/lib/beauty-guides";

export const metadata:Metadata={title:"Conseils pour réserver un rendez-vous beauté au Sénégal",description:"Coiffure, tresses, maquillage, onglerie et esthétique : préparez votre rendez-vous et comprenez les offres publiées sur Mata Beauty.",alternates:{canonical:"/conseils"}};
export default function BeautyGuidesPage(){return <main className="public-detail beauty-guide"><Link href="/">← Mata Beauty</Link><article>
  <h1>Préparer votre rendez-vous beauté au Sénégal</h1>
  <p>Avant de réserver, identifiez la prestation souhaitée, les éléments inclus et le temps nécessaire. Ces guides vous aident à préparer vos questions et à consulter les informations publiées par les professionnels sur Mata Beauty.</p>
  <p>Pour chaque rendez-vous, vérifiez la ville, le lieu, la durée, la devise et le prix du récapitulatif. Les créneaux et les services disponibles dépendent de chaque professionnel ; aucun guide ne remplace sa fiche ni les conditions de votre réservation.</p>
  {beautyGuides.map(guide=><section key={guide.slug}><h2><Link href={beautyGuideHref(guide.slug)}>{guide.title}</Link></h2><p>{guide.description}</p></section>)}
</article></main>;}
