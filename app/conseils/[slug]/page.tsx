import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { beautyCategorySearch, beautyGuide, beautyGuideHref, beautyGuides } from "@/lib/beauty-guides";

export function generateStaticParams() { return beautyGuides.map(({slug}) => ({slug})); }
export async function generateMetadata({params}: {params: Promise<{slug: string}>}): Promise<Metadata> {
  const guide = beautyGuide((await params).slug);
  if (!guide) return {title:"Guide introuvable",robots:{index:false,follow:false}};
  const canonical = beautyGuideHref(guide.slug);
  return {title:guide.title,description:guide.description,alternates:{canonical},
    openGraph:{title:guide.title,description:guide.description,url:canonical,type:"article",locale:"fr_SN",images:[{url:"/og.png",alt:"Mata Beauty — guides beauté au Sénégal"}]},
    twitter:{card:"summary_large_image",title:guide.title,description:guide.description,images:["/og.png"]}};
}
export default async function BeautyGuidePage({params}: {params:Promise<{slug:string}>}) {
  const guide = beautyGuide((await params).slug);
  if (!guide) notFound();
  const breadcrumb = {"@context":"https://schema.org","@type":"BreadcrumbList",itemListElement:[
    {"@type":"ListItem",position:1,name:"Mata Beauty",item:"https://mata-beauty.com/"},
    {"@type":"ListItem",position:2,name:"Conseils beauté",item:"https://mata-beauty.com/conseils"},
    {"@type":"ListItem",position:3,name:guide.title,item:`https://mata-beauty.com${beautyGuideHref(guide.slug)}`},
  ]};
  return <main className="public-detail beauty-guide">
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(breadcrumb).replace(/</g,"\\u003c")}} />
    <nav aria-label="Fil d’Ariane"><Link href="/">Mata Beauty</Link> · <Link href="/conseils">Conseils beauté</Link></nav>
    <article><h1>{guide.title}</h1><p>{guide.introduction}</p>
      {guide.sections.map(section=><section key={section.title}><h2>{section.title}</h2><p>{section.text}</p></section>)}
      <section><h2>Consulter les offres publiées</h2><p>Les résultats dépendent des professionnels présents et des informations qu’ils publient. Vérifiez leur ville, le prix et le créneau avant de réserver. Le règlement en ligne n’est pas activé : le montant total est actuellement à régler sur place.</p>
        <Link className="public-primary" href={beautyCategorySearch(guide.category)}>Voir les prestations : {guide.category.toLowerCase()}</Link>
        <p><Link href="/legal/annulation">Consulter les conditions d’annulation</Link></p>
      </section>
      <nav aria-label="Autres guides beauté"><h2>Préparer un autre rendez-vous</h2><ul>{beautyGuides.filter(item=>item.slug!==guide.slug).map(item=><li key={item.slug}><Link href={beautyGuideHref(item.slug)}>{item.title}</Link></li>)}</ul></nav>
    </article>
  </main>;
}
