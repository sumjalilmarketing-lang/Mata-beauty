import Link from "next/link";

export default function NotFound() {
  return (
    <main className="system-page">
      <section>
        <span>404</span>
        <h1>Cette page n’existe pas</h1>
        <p>Le lien est peut-être ancien ou incorrect.</p>
        <Link className="primary-button" href="/">Retour à l’accueil</Link>
      </section>
    </main>
  );
}
