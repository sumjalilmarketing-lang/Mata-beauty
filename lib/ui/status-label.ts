const labels: Record<string, string> = {
  pending: "En attente", confirmed: "Confirmé", declined: "Refusé", cancelled_by_client: "Annulé par le client", cancelled_by_provider: "Annulé par le professionnel",
  in_progress: "En cours", completed: "Terminé", no_show: "Absence", disputed: "En litige",
  published: "Publié", draft: "Brouillon", scheduled: "Programmé", hidden: "Masqué", archived: "Archivé", deleted: "Supprimé", rejected: "Refusé",
  video: "Vidéo", photo: "Photo", before_after: "Avant / Après",
};
export function statusLabel(value: string) { return labels[value] ?? "À vérifier"; }
