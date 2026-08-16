export const legalDocuments = [
  ["conditions-generales", "Conditions générales"], ["confidentialite", "Politique de confidentialité"],
  ["cookies", "Politique cookies"], ["conditions-prestataires", "Conditions prestataires"],
  ["annulation", "Politique d’annulation"], ["regles-communautaires", "Règles communautaires"],
  ["politique-contenus", "Politique contenus"], ["signalement-moderation", "Signalement / modération"],
] as const;

export function legalTitle(slug: string) { return legalDocuments.find(([key]) => key === slug)?.[1] ?? null; }
