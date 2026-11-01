import Link from "next/link";

export default function OfflinePage() {
  return (
    <main className="offline-page">
      <span className="brand-emblem">M</span>
      <p className="eyebrow">Mode hors ligne</p>
      <h1>Retrouvez Mata Beauty dès que votre connexion revient.</h1>
      <p>Vos données privées ne sont pas mises en cache. Reconnectez-vous pour rechercher un professionnel ou gérer vos rendez-vous.</p>
      <Link className="primary-button" href="/">Réessayer</Link>
    </main>
  );
}
