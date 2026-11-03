import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Suppression du compte et des données — Mata Beauty",
  description: "Comment demander la suppression de votre compte Mata Beauty et des données associées.",
};

export default function AccountDeletionPage() {
  return <main className="legal-page"><Link href="/">← Mata Beauty</Link><article>
    <h1>Suppression du compte et des données</h1>
    <p>Vous pouvez demander la suppression de votre compte Mata Beauty et des données associées depuis les paramètres de votre compte.</p>
    <ol>
      <li>Connectez-vous au compte concerné.</li>
      <li>Ouvrez « Confidentialité et compte ».</li>
      <li>Choisissez « Demander la suppression du compte » et confirmez votre demande.</li>
    </ol>
    <p><Link href="/app/settings">Ouvrir les paramètres du compte</Link> · <Link href="/pro/settings">Paramètres professionnels</Link></p>
    <h2>Traitement de la demande</h2>
    <p>La demande est enregistrée pour vérification par l’équipe Mata Beauty. Elle ne supprime pas immédiatement votre compte. Une désactivation ou un archivage du salon ne constitue pas une suppression du compte.</p>
    <p>Précisez dans votre demande si des réservations sont encore en cours. Les informations à conserver pour traiter une obligation légale, un paiement ou un litige doivent être distinguées des données à supprimer lors du traitement de votre demande.</p>
    <h2>Si vous ne pouvez plus vous connecter</h2>
    <p>Contactez <a href="mailto:africrmsuarl@gmail.com?subject=Suppression%20du%20compte%20Mata%20Beauty">AFRICRM SUARL</a> depuis l’adresse associée à votre compte et indiquez que vous demandez la suppression de votre compte Mata Beauty. N’envoyez jamais votre mot de passe.</p>
    <p><Link href="/legal/mentions-legales">Identité de l’éditeur</Link></p>
  </article></main>;
}
