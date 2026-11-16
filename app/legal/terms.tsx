import Link from "next/link";
import { legalPublisher } from "@/lib/legal-publisher";

export function Terms() {
  return (
    <main className="legal-page">
      <Link href="/">← Mata Beauty</Link>
      <article>
        <h1>Conditions générales d’utilisation et de réservation</h1>
        <p>Version du 16 novembre 2026</p>
        <h2>1. Éditeur et rôle de la plateforme</h2>
        <p>Mata Beauty est édité par {legalPublisher.name}, dont le siège est situé à {legalPublisher.registeredOffice}. La plateforme permet de consulter les prestations des salons et professionnels, de demander un rendez-vous et de suivre sa réservation. Le professionnel identifié sur la fiche de réservation réalise la prestation. Mata Beauty assure le fonctionnement du service de réservation et le suivi des demandes adressées à son support.</p>
        <p><Link href="/legal/mentions-legales">Consulter les mentions légales</Link></p>
        <h2>2. Compte et réservation</h2>
        <p>Fournissez des coordonnées exactes et protégez vos identifiants. Avant de confirmer, vérifiez le professionnel, la prestation, le prix, la devise, le lieu et l’heure. Le statut affiché dans votre espace indique si le rendez-vous est confirmé ou en attente. Conservez la référence et la confirmation de votre réservation.</p>
        <h2>3. Prix et paiement</h2>
        <p>Le prix total, l’éventuel acompte et le solde sont indiqués avant la confirmation. Tant que le paiement en ligne est indisponible, le prix est réglé sur place et un acompte affiché ne constitue pas un paiement. Si le paiement en ligne est proposé, l’acompte effectivement encaissé est déduit du prix total. Le moyen de paiement disponible est affiché avant tout encaissement.</p>
        <h2>4. Annulation, remboursement et rétractation</h2>
        <p>Si vous annulez au moins 48 heures avant le début du rendez-vous, l’acompte effectivement payé est intégralement remboursé. Si vous annulez à moins de 48 heures ou ne vous présentez pas, il peut être conservé, sous réserve de vos droits impératifs. Si le professionnel annule, toutes les sommes versées pour la réservation sont remboursées.</p>
        <p>Pour annuler, utilisez l’action prévue dans votre espace de réservation. Pour exercer un droit de rétractation applicable à votre contrat ou demander un remboursement, adressez au support une déclaration écrite avec votre référence de réservation. La règle des 48 heures s’applique sous réserve des droits impératifs dont vous bénéficiez en tant que consommateur.</p>
        <p><Link href="/legal/annulation">Consulter la politique d’annulation et de remboursement</Link></p>
        <h2>5. Utilisation du service et réclamations</h2>
        <p>Utilisez la plateforme pour des réservations et échanges légitimes. L’usurpation d’identité, la fraude et le harcèlement sont interdits. Pour signaler un problème de réservation, de paiement ou de prestation, transmettez votre référence et les éléments utiles au support. Vous pouvez également écrire au siège de l’éditeur indiqué ci-dessus. Vos recours légaux restent ouverts.</p>
        <Link href="/app/support">Contacter le support</Link>
      </article>
    </main>
  );
}
