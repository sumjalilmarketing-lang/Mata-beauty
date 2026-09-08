"use client";
export function ProductHelp({ professional = false }: { professional?: boolean }) {
  return <details className="panel product-help"><summary>Aide · Comment ça marche ?</summary><p>{professional ? "Créez votre profil → ajoutez vos prestations → configurez votre agenda → publiez → recevez vos clients." : "Regardez → découvrez → réservez → discutez."}</p><p>{professional ? "Mata Beauty valide votre profil avant sa publication. Pendant l’attente, vous pouvez préparer vos prestations, votre agenda et vos brouillons." : "Explorez librement. Connectez-vous au moment de réserver, d’enregistrer une inspiration ou d’écrire."}</p><button type="button" onClick={(event) => event.currentTarget.closest("details")?.removeAttribute("open")}>Fermer l’aide</button></details>;
}
