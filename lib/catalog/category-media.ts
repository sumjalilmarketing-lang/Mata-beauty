export type CategoryMedia = {
  src: string;
  alt: string;
  origin: "editorial" | "professional";
  categorySlug: string;
  providerId?: string;
  serviceId?: string;
  postId?: string;
};

export const categoryVisuals: Record<string, { name: string; subjects: [string, string] }> = {
  "coiffure-femme": { name: "Coiffure femme", subjects: ["Coiffage de cheveux naturels en salon", "Brushing réalisé par une coiffeuse"] },
  "tresses-africaines": { name: "Tresses africaines", subjects: ["Tresses knotless aux séparations nettes", "Réalisation de tresses collées"] },
  "coiffure-homme": { name: "Coiffure homme", subjects: ["Coupe dégradée à la tondeuse", "Coupe de cheveux texturés aux ciseaux"] },
  locks: { name: "Locks", subjects: ["Locks naturelles attachées", "Entretien des racines de locks"] },
  "perruques-lace-wigs": { name: "Perruques et lace wigs", subjects: ["Installation d’une lace wig", "Ajustement d’une perruque en salon"] },
  maquillage: { name: "Maquillage", subjects: ["Application de maquillage au pinceau", "Maquillage des yeux par une professionnelle"] },
  onglerie: { name: "Onglerie", subjects: ["Manucure et pose de vernis", "Réalisation de nail art"] },
  "cils-sourcils": { name: "Cils et sourcils", subjects: ["Pose professionnelle d’extensions de cils", "Mise en forme des sourcils"] },
  barbier: { name: "Barbier", subjects: ["Taille de barbe par un barbier", "Finition des contours de barbe"] },
  "soins-visage": { name: "Soins du visage", subjects: ["Application d’un masque en institut", "Soin du visage avec serviettes chaudes"] },
  "beaute-domicile": { name: "Beauté à domicile", subjects: ["Maquilleuse et son matériel au domicile d’une cliente", "Manucure professionnelle à domicile"] },
};

export function categorySlugFor(value: string): string | undefined {
  const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const aliases: Record<string, string> = { tresses: "tresses-africaines", "make-up": "maquillage" };
  if (aliases[normalized]) return aliases[normalized];
  return Object.keys(categoryVisuals).find(slug => slug === normalized || categoryVisuals[slug].name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-") === normalized);
}

export function editorialCategoryMedia(slugOrName: string): CategoryMedia[] {
  const slug = categorySlugFor(slugOrName);
  if (!slug) return [];
  return categoryVisuals[slug].subjects.map((alt, index) => ({ src: `/images/categories/${slug}-${index + 1}.webp`, alt, origin: "editorial", categorySlug: slug }));
}

/** A provider's portrait or salon cover is not a photograph of a specific service. */
export function serviceVisual(category: string, serviceCover?: string | null): string | undefined {
  return serviceCover || editorialCategoryMedia(category)[0]?.src;
}

export function categoryMediaSequence(slug: string, professional: CategoryMedia[] = []): CategoryMedia[] {
  const matching = professional.filter(item => item.origin === "professional" && item.categorySlug === slug && item.serviceId && item.providerId);
  return [...matching.slice(0, 3), ...editorialCategoryMedia(slug)].filter((item, index, all) => all.findIndex(other => other.src === item.src) === index);
}
