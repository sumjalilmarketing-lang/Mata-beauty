"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="system-page">
      <section>
        <span>◇</span>
        <h1>Un problème est survenu</h1>
        <p>La page n’a pas pu être chargée. Si une action était en cours, vérifiez son résultat avant de la relancer.</p>
        <button className="primary-button" onClick={reset}>Réessayer</button>
      </section>
    </main>
  );
}
