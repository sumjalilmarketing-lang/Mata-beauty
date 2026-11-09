export default function Loading() {
  return <main className="system-page" aria-busy="true">
    <section role="status" aria-live="polite" aria-label="Chargement de la page">
      <h1>Mata Beauty</h1>
      <p>Chargement de votre espace…</p>
      <div className="mobile-skeletons" aria-hidden="true"><i /><i /><i /></div>
    </section>
  </main>;
}
