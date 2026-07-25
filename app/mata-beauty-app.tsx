"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { AuthModal, type AuthenticatedProfile } from "./auth-modal";
import { LiveDashboard } from "./live-dashboard";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { fetchPublishedProviders } from "@/lib/supabase/catalog";
import { calculateBookingEnd, calculateBookingQuote } from "@/lib/domain/booking";

type Provider = {
  id: string | number;
  profileId?: string;
  serviceId?: string;
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
  durationMinutes?: number;
};

type BookingRequest = {
  date: string;
  time: string;
  locationMode: "salon" | "client_address";
  address: string;
  note: string;
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
  const [catalog, setCatalog] = useState<Provider[]>(providers);
  const [catalogSource, setCatalogSource] = useState<"demo" | "live" | "error">("demo");
  const [favorites, setFavorites] = useState<Array<string | number>>([2]);
  const [booking, setBooking] = useState<Provider | null>(null);
  const [profile, setProfile] = useState<Provider | null>(null);
  const [view, setView] = useState<"home" | "client" | "provider" | "admin">("home");
  const [notice, setNotice] = useState("");
  const [authenticated, setAuthenticated] = useState<AuthenticatedProfile | null>(null);
  const [authRequest, setAuthRequest] = useState<{
    role: "client" | "provider" | "admin";
    mode: "login" | "register";
  } | null>(null);

  const filteredProviders = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return catalog.filter((provider) => {
      const matchesText = !normalized || `${provider.name} ${provider.specialty} ${provider.area}`.toLowerCase().includes(normalized);
      const matchesCategory = category === "Toutes" || provider.category === category;
      const matchesArea = area === "Tout Dakar" || provider.area === area;
      return matchesText && matchesCategory && matchesArea;
    });
  }, [query, category, area, catalog]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    let active = true;

    void fetchPublishedProviders(supabase)
      .then((items) => {
        if (!active) return;
        if (items.length > 0) {
          setCatalog(items.map((item, index) => ({
            ...item,
            initials: item.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(),
            tone: ["plum", "gold", "rose", "berry", "sand"][index % 5],
            nextSlot: "Disponibilités à consulter",
          })));
          setCatalogSource("live");
        }
      })
      .catch(() => {
        if (active) {
          setCatalogSource("error");
          setNotice("Le catalogue réel est momentanément indisponible. Les exemples restent affichés.");
        }
      });

    void supabase.auth.getSession().then(async ({ data }) => {
      const user = data.session?.user;
      if (!active || !user) return;
      const { data: account } = await supabase.from("profiles").select("role,is_suspended").eq("id", user.id).maybeSingle();
      if (!active || !account || account.is_suspended) return;
      setAuthenticated({ userId: user.id, role: account.role });
      if (account.role === "client") {
        const { data: favoriteData } = await supabase.from("favorites").select("provider_id").eq("client_id", user.id);
        if (active && favoriteData) setFavorites(favoriteData.map((item) => item.provider_id));
      }
    });

    return () => { active = false; };
  }, []);

  async function toggleFavorite(provider: Provider) {
    const exists = favorites.includes(provider.id);
    if (!provider.profileId) {
      setFavorites((current) => exists ? current.filter((item) => item !== provider.id) : [...current, provider.id]);
      setNotice("Favori enregistré uniquement dans cet aperçu de démonstration.");
      return;
    }
    if (!authenticated || authenticated.role !== "client") {
      setAuthRequest({ role: "client", mode: "login" });
      return;
    }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const request = exists
      ? supabase.from("favorites").delete().eq("client_id", authenticated.userId).eq("provider_id", provider.profileId)
      : supabase.from("favorites").insert({ client_id: authenticated.userId, provider_id: provider.profileId });
    const { error } = await request;
    if (error) {
      setNotice(`Impossible de modifier le favori : ${error.message}`);
      return;
    }
    setFavorites((current) => exists ? current.filter((item) => item !== provider.id) : [...current, provider.id]);
  }

  async function confirmBooking(request: BookingRequest) {
    if (!booking) return;
    if (!booking.profileId || !booking.serviceId) {
      setBooking(null);
      setNotice("Demande simulée : aucune donnée n’a été envoyée en mode démonstration.");
      return;
    }
    if (!authenticated || authenticated.role !== "client") {
      setAuthRequest({ role: "client", mode: "login" });
      return;
    }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const startsAt = new Date(`${request.date}T${request.time}:00Z`);
    const endsAt = calculateBookingEnd(startsAt, booking.durationMinutes ?? 60);
    const quote = calculateBookingQuote(booking.price);
    const { error } = await supabase.from("bookings").insert({
      client_id: authenticated.userId,
      provider_id: booking.profileId,
      provider_service_id: booking.serviceId,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      status: "pending",
      location_mode: request.locationMode,
      appointment_address: request.locationMode === "client_address" ? request.address.trim() : null,
      total_amount: quote.totalAmount,
      currency: quote.currency,
      client_note: request.note.trim() || null,
    });
    if (error) {
      setNotice(error.code === "23P01" ? "Ce créneau vient d’être réservé. Choisissez-en un autre." : `Réservation impossible : ${error.message}`);
      return;
    }
    setBooking(null);
    setNotice("Réservation enregistrée. Le prestataire a reçu une notification.");
    window.setTimeout(() => setNotice(""), 4500);
  }

  async function signOut() {
    const supabase = getSupabaseBrowserClient();
    if (supabase) await supabase.auth.signOut();
    setAuthenticated(null);
    setView("home");
  }

  if (view !== "home") {
    if (authenticated && authenticated.role === view) {
      return <LiveDashboard role={view} userId={authenticated.userId} displayName="votre espace" onBack={() => setView("home")} onSignOut={signOut} />;
    }
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
          <button className="link-button" onClick={() => setAuthRequest({ role: "provider", mode: "login" })}>Espace pro</button>
        </nav>
        <div className="header-actions">
          <button className="ghost-button" onClick={() => setAuthRequest({ role: "client", mode: "login" })}>Se connecter</button>
          <button className="primary-button small" onClick={() => setAuthRequest({ role: "provider", mode: "register" })}>Devenir prestataire</button>
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
                {[...new Set(catalog.map((provider) => provider.area))].map((item) => <option key={item}>{item}</option>)}
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
          <div>
            <p className="eyebrow">Près de vous</p>
            <h2 id="provider-title">Les professionnels du moment</h2>
            <small className={`catalog-source ${catalogSource}`}>
              {catalogSource === "live" ? "Catalogue vérifié en direct" : "Aperçu de démonstration — aucun prestataire publié"}
            </small>
          </div>
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
                  <button className={favorites.includes(provider.id) ? "favorite active" : "favorite"} onClick={() => void toggleFavorite(provider)} aria-label={favorites.includes(provider.id) ? "Retirer des favoris" : "Ajouter aux favoris"}>{favorites.includes(provider.id) ? "♥" : "♡"}</button>
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
        <button className="gold-button" onClick={() => setAuthRequest({ role: "provider", mode: "register" })}>Créer mon profil professionnel →</button>
      </section>

      <footer>
        <a className="brand inverted" href="#accueil"><span className="brand-mark">M</span><span>Mata <i>Beauty</i></span></a>
        <p>La plateforme beauté de confiance au Sénégal.</p>
        <div><button onClick={() => setAuthRequest({ role: "client", mode: "login" })}>Espace client</button><button onClick={() => setAuthRequest({ role: "provider", mode: "login" })}>Espace prestataire</button><button onClick={() => setAuthRequest({ role: "admin", mode: "login" })}>Administration</button></div>
        <small>© 2026 Mata Beauty · Dakar, Sénégal · Paiements en mode test</small>
      </footer>

      {profile && <ProfileModal provider={profile} onClose={() => setProfile(null)} onBook={() => { setBooking(profile); setProfile(null); }} favorite={favorites.includes(profile.id)} onFavorite={() => void toggleFavorite(profile)} />}
      {booking && <BookingModal provider={booking} onClose={() => setBooking(null)} onSubmit={confirmBooking} />}
      {authRequest && (
        <AuthModal
          initialMode={authRequest.mode}
          intendedRole={authRequest.role === "provider" ? "provider" : "client"}
          onClose={() => setAuthRequest(null)}
          onAuthenticated={(profile) => {
            setAuthenticated(profile);
            setAuthRequest(null);
            setView(profile.role);
          }}
          onDemo={() => {
            setAuthRequest(null);
            setView(authRequest.role);
          }}
        />
      )}
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

function BookingModal({ provider, onClose, onSubmit }: { provider: Provider; onClose: () => void; onSubmit: (request: BookingRequest) => Promise<void> }) {
  const [submitting, setSubmitting] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    await onSubmit({
      date: String(form.get("date") ?? ""),
      time: String(form.get("time") ?? ""),
      locationMode: String(form.get("locationMode")) === "client_address" ? "client_address" : "salon",
      address: String(form.get("address") ?? ""),
      note: String(form.get("note") ?? ""),
    });
    setSubmitting(false);
  }
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="modal booking-modal" role="dialog" aria-modal="true" aria-labelledby="booking-title">
      <button className="modal-close" onClick={onClose} aria-label="Fermer">×</button>
      <p className="eyebrow">Réservation sécurisée</p><h2 id="booking-title">Réserver avec {provider.name}</h2>
      <form onSubmit={(event) => void submit(event)}>
        <label>Prestation<select required><option>{provider.specialty} — {formatPrice(provider.price)}</option><option>Formule signature — {formatPrice(provider.price + 7000)}</option></select></label>
        <div className="form-row"><label>Date<input name="date" type="date" required defaultValue="2026-07-28" min="2026-07-26" /></label><label>Créneau<select name="time" required><option>10:00</option><option>14:30</option><option>16:30</option></select></label></div>
        <label>Lieu<select name="locationMode" required>{provider.homeService && <option value="client_address">À mon domicile</option>}<option value="salon">Chez le prestataire</option></select></label>
        <label>Adresse / précision<textarea name="address" placeholder="Quartier, rue, repère…" /></label>
        <label>Note facultative<textarea name="note" maxLength={1000} placeholder="Informations utiles pour le rendez-vous…" /></label>
        <label>Paiement<select required><option>Sur place</option><option disabled>Wave — bientôt disponible</option><option disabled>Orange Money — bientôt disponible</option></select></label>
        <div className="test-banner">Mode test · Aucun paiement réel ne sera effectué.</div>
        <div className="booking-total"><span>Total</span><strong>{formatPrice(provider.price)}</strong></div>
        <button className="primary-button full" type="submit" disabled={submitting}>{submitting ? "Enregistrement…" : "Envoyer la demande"}</button>
      </form>
    </section>
  </div>;
}

function Dashboard({ role, onBack }: { role: "client" | "provider" | "admin"; onBack: () => void }) {
  const [demoMessage, setDemoMessage] = useState("");
  const config = {
    client: { label: "Espace client", name: "Aïssatou Ndiaye", intro: "Retrouvez vos rendez-vous et vos favoris.", metrics: [["2", "Réservations à venir"], ["6", "Favoris"], ["1", "Message non lu"]] },
    provider: { label: "Espace prestataire", name: "Awa Signature", intro: "Voici l’activité de votre établissement.", metrics: [["8", "Rendez-vous cette semaine"], ["124 000 F", "Revenus simulés"], ["4,9", "Note moyenne"]] },
    admin: { label: "Administration", name: "Équipe Mata", intro: "Pilotez la qualité et la sécurité de la plateforme.", metrics: [["128", "Prestataires actifs"], ["12", "Validations en attente"], ["4", "Signalements ouverts"]] },
  }[role];
  return <main className="dashboard">
    <aside className="sidebar">
      <button className="brand brand-button" onClick={onBack}><span className="brand-mark">M</span><span>Mata <i>Beauty</i></span></button>
      <p className="role-pill">{config.label}</p>
      <nav><button className="active" onClick={() => setDemoMessage("Vue d’ensemble de démonstration.")}>⌂ Vue d’ensemble</button><button onClick={() => setDemoMessage("Les réservations réelles apparaîtront après connexion Supabase.")}>▣ Réservations</button><button onClick={() => setDemoMessage("La messagerie nécessite un compte connecté.")}>◌ Messages <i>1</i></button><button onClick={() => setDemoMessage("Cette rubrique est disponible après connexion.")}>{role === "client" ? "♡ Favoris" : role === "provider" ? "◇ Prestations" : "♢ Vérifications"}</button><button onClick={() => setDemoMessage("Les paramètres de démonstration ne sont pas persistés.")}>⚙ Paramètres</button></nav>
      <button className="back-link" onClick={onBack}>← Retour au site</button>
    </aside>
    <section className="dashboard-main">
      <div className="dashboard-top"><div><p className="eyebrow">{config.label}</p><h1>Bonjour, {config.name.split(" ")[0]} 👋</h1><p>{config.intro}</p></div><span className="demo-badge">Mode démonstration</span></div>
      {demoMessage && <p className="dashboard-feedback" role="status">{demoMessage}</p>}
      <div className="metric-grid">{config.metrics.map(([value, label]) => <article key={label}><span>{label}</span><strong>{value}</strong><small>↗ à jour</small></article>)}</div>
      <div className="dashboard-grid">
        <article className="panel"><div className="panel-heading"><h2>{role === "admin" ? "Activité récente" : "Prochains rendez-vous"}</h2><button onClick={() => setDemoMessage("Aucune donnée réelle n’est chargée en mode démonstration.")}>Tout voir</button></div>
          {[["Aujourd’hui · 16:30", "Nails by Fatou", "Confirmé"], ["Jeudi · 10:00", "Maison Kéwé", role === "admin" ? "À vérifier" : "En attente"], ["Samedi · 09:00", "Institut Teranga", "Confirmé"]].map(([date, name, status]) => <div className="appointment" key={date}><span className="date-block">{date.split(" · ")[0].slice(0, 3)}<b>{date.split(" · ")[1]}</b></span><div><strong>{name}</strong><small>{date}</small></div><span className={status === "Confirmé" ? "status confirmed" : "status pending"}>{status}</span></div>)}
        </article>
        <article className="panel"><div className="panel-heading"><h2>Actions rapides</h2></div><div className="quick-actions"><button onClick={() => setDemoMessage("Connectez Supabase pour effectuer cette action.")}>＋ {role === "provider" ? "Ajouter une prestation" : role === "admin" ? "Valider un profil" : "Nouvelle réservation"}</button><button onClick={() => setDemoMessage("La messagerie réelle nécessite une session.")}>◌ Consulter les messages</button><button onClick={() => setDemoMessage("Les changements ne sont pas enregistrés en mode démonstration.")}>⚙ Mettre à jour le profil</button></div></article>
      </div>
    </section>
  </main>;
}
