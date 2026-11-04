export function normalizeInvitationPhone(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 40 || !/^[+\d\s().-]+$/.test(value)) return null;
  const compact = value.trim().replace(/[\s().-]/g, "").replace(/^00/, "+");
  return /^\+[1-9]\d{7,14}$/.test(compact) ? compact : null;
}

export function whatsappSalonInvitation(phone: string, inviteUrl: string): string | null {
  const normalized = normalizeInvitationPhone(phone);
  if (!normalized) return null;
  const text = `Bonjour, rejoins notre équipe sur Mata Beauty : ${inviteUrl}\nConnecte-toi, puis demande à rejoindre l’équipe. Le responsable confirmera ton accès.`;
  return `https://wa.me/${normalized.slice(1)}?text=${encodeURIComponent(text)}`;
}
