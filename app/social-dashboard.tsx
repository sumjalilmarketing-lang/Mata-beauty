"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type CreatorStat = { post_id: string; views: number; average_watch_ms: number; completion_rate: number; likes: number; comments: number; saves: number; shares: number; new_followers: number; profile_visits: number; booking_clicks: number; bookings: number; gross_amount: number };
type Collection = { id: string; name: string };
type SavedPost = { post_id: string; posts: { caption: string; thumbnail_url: string | null } | null };

export function SocialDashboard({ role, userId }: { role: "client" | "provider"; userId: string }) {
  const [stats, setStats] = useState<CreatorStat[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [saved, setSaved] = useState<SavedPost[]>([]);

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    if (role === "provider") {
      const { data } = await supabase.rpc("provider_creator_statistics");
      setStats((data ?? []) as CreatorStat[]);
      return;
    }
    const [collectionResult, savedResult] = await Promise.all([
      supabase.from("inspiration_collections").select("id,name").eq("owner_id", userId).order("created_at"),
      supabase.from("post_saves").select("post_id,posts(caption,thumbnail_url)").eq("profile_id", userId).order("created_at", { ascending: false }).limit(24),
    ]);
    setCollections((collectionResult.data ?? []) as Collection[]);
    setSaved((savedResult.data ?? []) as unknown as SavedPost[]);
  }, [role, userId]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  async function createCollection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = String(new FormData(form).get("name") ?? "").trim();
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !name) return;
    const { error } = await supabase.from("inspiration_collections").insert({ owner_id: userId, name });
    if (!error) { form.reset(); await load(); }
  }

  if (role === "provider") return <article className="panel" id="creator-statistics"><div className="panel-heading"><div><h2>Performances</h2><p>Découverte, engagement et réservations réellement attribués à chaque contenu.</p></div><button onClick={() => void load()}>Actualiser</button></div>{stats.length === 0 ? <div className="compact-empty">Publiez une vidéo pour commencer à mesurer son impact.</div> : <div className="creator-stat-grid">{stats.map((item) => <section key={item.post_id}><small>Vidéo {item.post_id.slice(0, 8)}</small><strong>{item.views.toLocaleString("fr-FR")} vues</strong><span>{(item.average_watch_ms/1000).toFixed(1)} s de watch time moyen · {Number(item.completion_rate).toFixed(1)} % complétées</span><span>{item.likes} likes · {item.comments} commentaires · {item.saves} sauvegardes · {item.shares} partages</span><span>{item.new_followers} nouveaux abonnés · {item.profile_visits} visites du profil</span><span>{item.booking_clicks} clics Réserver · {item.bookings} réservations</span><b>{item.gross_amount.toLocaleString("fr-FR")} FCFA générés</b></section>)}</div>}</article>;

  return <article className="panel" id="inspirations"><div className="panel-heading"><div><h2>Mes inspirations</h2><p>Vidéos enregistrées, professionnels favoris et collections personnelles.</p></div></div><form className="collection-form" onSubmit={(event) => void createCollection(event)}><input name="name" required maxLength={80} aria-label="Nom de la collection" placeholder="Nouvelle collection" /><button>Créer</button></form><div className="collection-pills">{collections.map((collection) => <span key={collection.id}>{collection.name}</span>)}</div>{saved.length === 0 ? <div className="compact-empty">Enregistrez une vidéo depuis le feed pour la retrouver ici.</div> : <div className="saved-post-grid">{saved.map((item) => <article key={item.post_id}>{item.posts?.thumbnail_url ? <Image src={item.posts.thumbnail_url} alt="" width={320} height={240} unoptimized /> : <span>▶</span>}<p>{item.posts?.caption ?? "Inspiration beauté"}</p></article>)}</div>}</article>;
}
