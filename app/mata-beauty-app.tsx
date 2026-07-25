"use client";

import { FormEvent, useMemo, useState } from "react";
import Image from "next/image";

type Provider = {
  id: number;
  name: string;
  specialty: string;
  category: string;
  area: string;
  price: number;
  rating: number;
  reviews: number;
  initials: string;
  tone: string;
  verified: boolean;
  homeService: boolean;
  nextSlot: string;
};

const categories = [
  ["✦", "Coiffure femme"],
  ["≋", "Tresses africaines"],
  ["◌", "Locks"],
  ["♢", "Maquillage"],
  ["◐", "Onglerie"],
  ["⌁", "Cils & sourcils"],
  ["✂", "Barbier"],
  ["♡", "Soins du visage"],
];

const providers: Provider[] = [
  { id: 1, name: "Awa Signature", specialty: "Tresses & coiffure afro", category: "Tresses africaines", area: "Almadies", price: 15000, rating: 4.9, reviews: 127, initials: "AS", tone: "plum", verified: true, homeService: true, nextSlot: "Aujourd’hui · 16:30" },
  { id: 2, name: "Maison Kéwé", specialty: "Maquillage & mariée", category: "Maquillage", area: "Mermoz", price: 25000, rating: 4.8, reviews: 94, initials: "MK", tone: "gold", verified: true, homeService: false, nextSlot: "Demain · 10:00" },
  { id: 3, name: "Nails by Fatou", specialty: "Manucure & nail art", category: "Onglerie", area: "Sacré-Cœur", price: 8000, rating: 4.9, reviews: 81, initials: "NF", tone: "rose", verified: true, homeService: true, nextSlot: "Aujourd’hui · 18:00" },
  { id: 4, name: "Studio Nappy", specialty: "Locks & cheveux naturels", category: "Locks", area: "Point E", price: 12000, rating: 4.7, reviews: 68, initials: "SN", tone: "berry", verified: true, homeService: false, nextSlot: "Mercredi · 09:30" },
  { id: 5, name: "Belle Peau Dakar", specialty: "Soins visage & épilation", category: "Soins du visage", area: "Plateau", price: 18000, rating: 4.8, reviews: 76, initials: "BP", tone: "sand", verified: true, homeService: true, nextSlot: "Demain · 14:00" },
  { id: 6, name: "Keur Barber", specialty: "Coupe homme & barbe", category: "Barbier", area: "Ouakam", price: 5000, rating: 4.6, reviews: 112, initials: "KB", tone: "ink", verified: true, homeService: false, nextSlot: "Aujourd’hui · 15:00" },
  { id: 7, name: "Lashes de Marième", specialty: "Extensions de cils", category: "Cils & sourcils", area: "Yoff", price: 14000, rating: 4.9, reviews: 53, initials: "LM", tone: "lilac", verified: true, homeService: true, nextSlot: "Jeudi · 11:00" },
  { id: 8, name: "Dior Hair Lab", specialty: "Perruques & lace wigs", category: "Coiffure femme", area: "Liberté 6", price: 20000, rating: 4.7, reviews: 89, initials: "DH", tone: "wine", verified: true, homeService: true, nextSlot: "Demain · 12:30" },
  { id: 9, name: "Sira Beauty Room", specialty: "Coiffure & brushing", category: "Coiffure femme", area: "Parcelles", price: 10000, rating: 4.6, reviews: 47, initials: "SB", tone: "coral", verified: false, homeService: true, nextSlot: "Vendredi · 10:00" },
  { id: 10, name: "L’Atelier Brow", specialty: "Sourcils & brow lift", category: "Cils & sourcils", area: "Fann", price: 9000, rating: 4.8, reviews: 61, initials: "AB", tone: "taupe", verified: true, homeService: false, nextSlot: "Mercredi · 13:00" },
  { id: 11, name: "Mame Tresses", specialty: "Braids & vanilles", category: "Tresses africaines", area: "Guédiawaye", price: 11000, rating: 4.7, reviews: 105, initials: "MT", tone: "cocoa", verified: true, homeService: true, nextSlot: "Aujourd’hui · 17:30" },
  { id: 12, name: "Institut Teranga", specialty: "Pédicure & bien-être", category: "Onglerie", area: "Ngor", price: 13000, rating: 4.9, reviews: 38, initials: "IT", tone: "sage", verified: true, homeService: false, nextSlot: "Samedi · 09:00" },
];

const formatPrice = (value: number) =>
  new Intl.NumberFormat("fr-FR").format(value) + " F";

export function MataBeautyApp() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Toutes");
  const [area, setArea] = useState("Tout Dakar");
  const [favorites, setFavorites] = useState<number[]>([2]);
  const [booking, setBooking] = useState<Provider | null>(null);
  const [profile, setProfile] = useState<Provider | null>(null);
  const [view, setView] = useState<"home" | "client" | "provider" | "admin">("home");
  const [notice, setNotice] = useState("");

  const filteredProviders = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return providers.filter((provider) => {
      const matchesText = !normalized || `${provider.name} ${provider.specialty} ${provider.area}`.toLowerCase().includes(normalized);
      const matchesCategory = category === "Toutes" || provider.category === category;
      const matchesArea = area === "Tout Dakar" || provider.area === area;
      return matchesText && matchesCategory && matchesArea;
    });
  }, [query, category, area]);

  function toggleFavorite(id: number) {
    setFavorites((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function confirmBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBooking(null);
    setNotice("Réservation envoyée ! Le prestataire doit maintenant la confirmer.");
    window.setTimeout(() => setNotice(""), 4500);
  }

  if (view !== "home") {
    return <Dashboard role={view} onBack={() => setView("home")} />;
  }

  return (
    <main>
      {notice && <div className="toast" role="status">✓ {notice}</div>}
      <header className="topbar">
        <a className="brand" href="#accueil" aria-label="Mata Beauty, accueil">
          <span className="brand-mark">M</span>
          <span>Mata <i>Beauty</i></span>
        </a>
        <nav className="desktop-nav" aria-label="Navigation principale">
          <a href="#explorer">Explorer</a>
          <a href="#fonctionnement">Comment ça marche</a>
          <button className="link-button" onClick={() => setView("provider")}>Espace pro</button>
        </nav>
        <div className="header-actions">
          <button className="ghost-button" onClick={() => setView("client")}>Se connecter</button>
          <button className="primary-button small" onClick={() => setView("provider")}>Devenir prestataire</button>
        </div>
      </header>

      <section className="hero" id="accueil">
        <div className="hero-copy">
          <p className="eyebrow"><span>✦</span> La beauté, près de chez vous</p>
          <h1>Votre beauté.<br /><em>Votre moment.</em></h1>
          <p className="hero-lead">Trouvez les meilleurs professionnels de beauté au Sénégal et réservez en quelques instants, en toute confiance.</p>
          <form className="search-bar" onSubmit={(event) => event.preventDefault()}>
            <label>
              <span>Que recherchez-vous ?</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tresses, maquillage, barbier…" />
            </label>
            <label>
              <span>Où ?</span>
              <select value={area} onChange={(event) => setArea(event.target.value)}>
                <option>Tout Dakar</option>
                {[...new Set(providers.map((provider) => provider.area))].map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <button className="search-button" type="submit" onClick={() => document.getElementById("explorer")?.scrollIntoView({ behavior: "smooth" })}>Rechercher</button>
          </form>
          <div className="trust-row">
            <span><b>4,8/5</b> note moyenne</span>
            <span><b>+120</b> professionnels</span>
            <span><b>100%</b> profils contrôlés</span>
          </div>
        </div>
        <div className="hero-visual" aria-label="Professionnelle réalisant des tresses en salon">
          <div className="image-frame">
            <Image
              src="https://images.unsplash.com/photo-1763048208932-cbe149724374?auto=format&fit=crop&q=84&w=1200"
              alt="Professionnelle réalisant des tresses dans un salon"
              width={1200}
              height={1500}
              priority
              unoptimized
            />
          </div>
          <div className="floating-card rating-card">
            <span className="floating-icon">★</span>
            <div><strong>4,9 sur 5</strong><small>1 240 avis vérifiés</small></div>
          </div>
          <div className="floating-card booking-card">
            <span className="floating-icon calendar">25</span>
            <div><strong>Créneau confirmé</strong><small>Aujourd’hui à 16:30</small></div>
          </div>
        </div>
      </section>

      <section className="section categories-section" aria-labelledby="category-title">
        <div className="section-heading">
          <div><p className="eyebrow">Nos expertises</p><h2 id="category-title">Que souhaitez-vous réserver ?</h2></div>
          <a href="#explorer">Voir toutes les catégories →</a>
        </div>
        <div className="category-grid">
          {categories.map(([icon, label]) => (
            <button key={label} className={category === label ? "category-card active" : "category-card"} onClick={() => { setCategory(category === label ? "Toutes" : label); document.getElementById("explorer")?.scrollIntoView({ behavior: "smooth" }); }}>
              <span>{icon}</span><strong>{label}</strong>
            </button>
          ))}
        </div>
      </section>

      <section className="section providers-section" id="explorer" aria-labelledby="provider-title">
        <div className="section-heading">
          <div><p className="eyebrow">Près de vous</p><h2 id="provider-title">Les professionnels du moment</h2></div>
          <span className="result-count">{filteredProviders.length} résultat{filteredProviders.length !== 1 ? "s" : ""}</span>
        </div>
        <div className="filters" aria-label="Filtres">
          {["Toutes", "Coiffure femme", "Tresses africaines", "Maquillage", "Onglerie", "Barbier"].map((item) => (
            <button key={item} className={category === item ? "filter active" : "filter"} onClick={() => setCategory(item)}>{item}</button>
          ))}
        </div>
        {filteredProviders.length ? (
          <div className="provider-grid">
            {filteredProviders.map((provider) => (
              <article className="provider-card" key={provider.id}>
                <div className={`provider-cover ${provider.tone}`}>
                  <span className="avatar">{provider.initials}</span>
                  {provider.verified && <span className="verified">✓ Profil vérifié</span>}
                  <button className={favorites.includes(provider.id) ? "favorite active" : "favorite"} onClick={() => toggleFavorite(provider.id)} aria-label={favorites.includes(provider.id) ? "Retirer des favoris" : "Ajouter aux favoris"}>{favorites.includes(provider.id) ? "♥" : "♡"}</button>
                </div>
                <div className="provider-body">
                  <div className="provider-title"><div><h3>{provider.name}</h3><p>{provider.specialty}</p></div><span className="rating">★ {provider.rating}</span></div>
                  <div className="provider-meta"><span>⌖ {provider.area}</span><span>{provider.homeService ? "À domicile" : "En salon"}</span></div>
                  <div className="provider-bottom">
                    <div><small>À partir de</small><strong>{formatPrice(provider.price)}</strong></div>
                    <button className="outline-button" onClick={() => setProfile(provider)}>Voir le profil</button>
                  </div>
                  <button className="slot-button" onClick={() => setBooking(provider)}><span>Prochain créneau</span><strong>{provider.nextSlot}</strong></button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state"><span>◇</span><h3>Aucun professionnel trouvé</h3><p>Essayez une autre zone ou une catégorie différente.</p><button className="outline-button" onClick={() => { setQuery(""); setArea("Tout Dakar"); setCategory("Toutes"); }}>Réinitialiser les filtres</button></div>
        )}
      </section>

      <section className="how-section" id="fonctionnement">
        <div className="section-heading centered"><div><p className="eyebrow">Simple & serein</p><h2>Votre rendez-vous en 3 étapes</h2></div></div>
        <div className="steps">
          <article><span>01</span><h3>Trouvez votre expert</h3><p>Comparez les profils, tarifs, disponibilités et avis vérifiés près de chez vous.</p></article>
          <article><span>02</span><h3>Choisissez un créneau</h3><p>Sélectionnez la prestation et l’horaire qui vous conviennent le mieux.</p></article>
          <article><span>03</span><h3>Profitez du moment</h3><p>Recevez votre confirmation et retrouvez tous les détails dans votre espace.</p></article>
        </div>
      </section>

      <section className="pro-cta">
        <div><p className="eyebrow light">Professionnels de beauté</p><h2>Votre talent mérite<br />d’être découvert.</h2><p>Développez votre clientèle, gérez votre agenda et faites rayonner votre savoir-faire.</p></div>
        <button className="gold-button" onClick={() => setView("provider")}>Créer mon profil professionnel →</button>
      </section>

      <footer>
        <a className="brand inverted" href="#accueil"><span className="brand-mark">M</span><span>Mata <i>Beauty</i></span></a>
        <p>La plateforme beauté de confiance au Sénégal.</p>
        <div><button onClick={() => setView("client")}>Espace client</button><button onClick={() => setView("provider")}>Espace prestataire</button><button onClick={() => setView("admin")}>Administration</button></div>
        <small>© 2026 Mata Beauty · Dakar, Sénégal · Paiements en mode test</small>
      </footer>

      {profile && <ProfileModal provider={profile} onClose={() => setProfile(null)} onBook={() => { setBooking(profile); setProfile(null); }} favorite={favorites.includes(profile.id)} onFavorite={() => toggleFavorite(profile.id)} />}
      {booking && <BookingModal provider={booking} onClose={() => setBooking(null)} onSubmit={confirmBooking} />}
    </main>
  );
}

function ProfileModal({ provider, onClose, onBook, favorite, onFavorite }: { provider: Provider; onClose: () => void; onBook: () => void; favorite: boolean; onFavorite: () => void }) {
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="modal profile-modal" role="dialog" aria-modal="true" aria-labelledby="profile-name">
      <button className="modal-close" onClick={onClose} aria-label="Fermer">×</button>
      <div className={`profile-hero ${provider.tone}`}><span className="avatar large">{provider.initials}</span></div>
      <div className="profile-content">
        <p className="eyebrow">{provider.verified ? "✓ Profil vérifié" : "Nouveau talent"}</p>
        <h2 id="profile-name">{provider.name}</h2>
        <p>{provider.specialty} · {provider.area}</p>
        <div className="profile-stats"><span><b>{provider.rating}</b> note</span><span><b>{provider.reviews}</b> avis</span><span><b>4 ans</b> d’expérience</span></div>
        <h3>Prestations populaires</h3>
        <div className="service-list"><div><span>{provider.specialty}</span><b>{formatPrice(provider.price)}</b></div><div><span>Formule signature</span><b>{formatPrice(provider.price + 7000)}</b></div></div>
        <h3>À propos</h3><p className="muted">Un accueil chaleureux, des conseils personnalisés et une attention particulière portée à chaque détail. Produits professionnels et hygiène rigoureuse.</p>
        <div className="modal-actions"><button className="outline-button" onClick={onFavorite}>{favorite ? "♥ Favori" : "♡ Ajouter aux favoris"}</button><button className="primary-button" onClick={onBook}>Réserver maintenant</button></div>
      </div>
    </section>
  </div>;
}

function BookingModal({ provider, onClose, onSubmit }: { provider: Provider; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="modal booking-modal" role="dialog" aria-modal="true" aria-labelledby="booking-title">
      <button className="modal-close" onClick={onClose} aria-label="Fermer">×</button>
      <p className="eyebrow">Réservation sécurisée</p><h2 id="booking-title">Réserver avec {provider.name}</h2>
      <form onSubmit={onSubmit}>
        <label>Prestation<select required><option>{provider.specialty} — {formatPrice(provider.price)}</option><option>Formule signature — {formatPrice(provider.price + 7000)}</option></select></label>
        <div className="form-row"><label>Date<input type="date" required defaultValue="2026-07-28" min="2026-07-26" /></label><label>Créneau<select required><option>10:00</option><option>14:30</option><option>16:30</option></select></label></div>
        <label>Lieu<select required><option>{provider.homeService ? "À mon domicile" : "Chez le prestataire"}</option><option>Chez le prestataire</option></select></label>
        <label>Adresse / précision<textarea placeholder="Quartier, rue, repère…" required /></label>
        <label>Paiement<select required><option>Sur place</option><option disabled>Wave — bientôt disponible</option><option disabled>Orange Money — bientôt disponible</option></select></label>
        <div className="test-banner">Mode test · Aucun paiement réel ne sera effectué.</div>
        <div className="booking-total"><span>Total</span><strong>{formatPrice(provider.price)}</strong></div>
        <button className="primary-button full" type="submit">Envoyer la demande</button>
      </form>
    </section>
  </div>;
}

function Dashboard({ role, onBack }: { role: "client" | "provider" | "admin"; onBack: () => void }) {
  const config = {
    client: { label: "Espace client", name: "Aïssatou Ndiaye", intro: "Retrouvez vos rendez-vous et vos favoris.", metrics: [["2", "Réservations à venir"], ["6", "Favoris"], ["1", "Message non lu"]] },
    provider: { label: "Espace prestataire", name: "Awa Signature", intro: "Voici l’activité de votre établissement.", metrics: [["8", "Rendez-vous cette semaine"], ["124 000 F", "Revenus simulés"], ["4,9", "Note moyenne"]] },
    admin: { label: "Administration", name: "Équipe Mata", intro: "Pilotez la qualité et la sécurité de la plateforme.", metrics: [["128", "Prestataires actifs"], ["12", "Validations en attente"], ["4", "Signalements ouverts"]] },
  }[role];
  return <main className="dashboard">
    <aside className="sidebar">
      <button className="brand brand-button" onClick={onBack}><span className="brand-mark">M</span><span>Mata <i>Beauty</i></span></button>
      <p className="role-pill">{config.label}</p>
      <nav><button className="active">⌂ Vue d’ensemble</button><button>▣ Réservations</button><button>◌ Messages <i>1</i></button><button>{role === "client" ? "♡ Favoris" : role === "provider" ? "◇ Prestations" : "♢ Vérifications"}</button><button>⚙ Paramètres</button></nav>
      <button className="back-link" onClick={onBack}>← Retour au site</button>
    </aside>
    <section className="dashboard-main">
      <div className="dashboard-top"><div><p className="eyebrow">{config.label}</p><h1>Bonjour, {config.name.split(" ")[0]} 👋</h1><p>{config.intro}</p></div><span className="demo-badge">Mode démonstration</span></div>
      <div className="metric-grid">{config.metrics.map(([value, label]) => <article key={label}><span>{label}</span><strong>{value}</strong><small>↗ à jour</small></article>)}</div>
      <div className="dashboard-grid">
        <article className="panel"><div className="panel-heading"><h2>{role === "admin" ? "Activité récente" : "Prochains rendez-vous"}</h2><button>Tout voir</button></div>
          {[["Aujourd’hui · 16:30", "Nails by Fatou", "Confirmé"], ["Jeudi · 10:00", "Maison Kéwé", role === "admin" ? "À vérifier" : "En attente"], ["Samedi · 09:00", "Institut Teranga", "Confirmé"]].map(([date, name, status]) => <div className="appointment" key={date}><span className="date-block">{date.split(" · ")[0].slice(0, 3)}<b>{date.split(" · ")[1]}</b></span><div><strong>{name}</strong><small>{date}</small></div><span className={status === "Confirmé" ? "status confirmed" : "status pending"}>{status}</span></div>)}
        </article>
        <article className="panel"><div className="panel-heading"><h2>Actions rapides</h2></div><div className="quick-actions"><button>＋ {role === "provider" ? "Ajouter une prestation" : role === "admin" ? "Valider un profil" : "Nouvelle réservation"}</button><button>◌ Consulter les messages</button><button>⚙ Mettre à jour le profil</button></div></article>
      </div>
    </section>
  </main>;
}
