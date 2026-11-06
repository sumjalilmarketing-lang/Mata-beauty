import Link from "next/link";
import type { PublicSocialProfileData } from "@/lib/profiles/public-social-profile";

/** Server-rendered links remain discoverable without opening an interactive tab. */
export function PublicProfileCatalog({ profile }: { profile: PublicSocialProfileData }) {
  if (!profile.services.length) return null;
  const path = `${profile.kind === "salon" ? "/salons" : "/professional"}/${encodeURIComponent(profile.slug)}`;
  const url = `https://mata-beauty.com${path}`;
  const schema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Prestations de ${profile.name}`,
    url: `${url}#prestations-publiees`,
    numberOfItems: profile.services.length,
    itemListElement: profile.services.map((service, index) => ({
      "@type": "ListItem", position: index + 1,
      url: `https://mata-beauty.com/service/${encodeURIComponent(service.id)}`,
      name: service.title,
    })),
  };
  return <section className="profile-public-catalog" id="prestations-publiees" aria-labelledby="published-services-title">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, "\\u003c") }} />
    <h2 id="published-services-title">Prestations de {profile.name}</h2>
    <p>{[profile.area, profile.city].filter(Boolean).join(" · ")}</p>
    <p>Choisissez une prestation pour voir ses disponibilités et réserver.</p>
    <ul>{profile.services.map(service => <li key={service.id}>
      <Link href={`/?service=${encodeURIComponent(service.id)}`}>{service.title} · Voir les créneaux</Link>
      <span>{service.durationMinutes} min · {service.priceAmount.toLocaleString("fr-FR")} {service.currency}</span>
    </li>)}</ul>
    <Link href="/conseils">Conseils pour préparer votre rendez-vous beauté</Link>
  </section>;
}
