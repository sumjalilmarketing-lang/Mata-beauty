"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function ProviderLogoEditor({ userId }: { userId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    const client = getSupabaseBrowserClient();
    if (!client) return;
    void Promise.all([
      client.from("provider_profiles").select("logo_url").eq("profile_id", userId).maybeSingle(),
      client.from("profiles").select("avatar_url").eq("id", userId).maybeSingle(),
    ]).then(([provider, profile]) => {
      if (!active) return;
      if (provider.error || profile.error) setNotice("L’aperçu du logo n’a pas pu être chargé. Vous pouvez réessayer en rouvrant cette page.");
      setUrl(provider.data?.logo_url || profile.data?.avatar_url || null);
    });
    return () => { active = false; };
  }, [userId]);

  async function upload(file: File) {
    if (busy) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size === 0 || file.size > 5 * 1024 * 1024) {
      setNotice("Choisissez une image JPG, PNG ou WebP de 5 Mo maximum."); return;
    }
    const client = getSupabaseBrowserClient();
    if (!client) { setNotice("Reconnectez-vous pour enregistrer votre logo."); return; }
    setBusy(true); setNotice("");
    // A new path prevents the browser and installed app from reusing an old image.
    const extension = file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1];
    const path = `${userId}/professional-logo-${crypto.randomUUID()}.${extension}`;
    try {
      const sent = await client.storage.from("avatars").upload(path, file, { contentType: file.type, upsert: false });
      if (sent.error) throw sent.error;
      const next = client.storage.from("avatars").getPublicUrl(path).data.publicUrl;
      const saved = await client.from("provider_profiles").update({ logo_url: next }).eq("profile_id", userId).select("profile_id,logo_url").maybeSingle();
      if (saved.error || saved.data?.logo_url !== next) {
        await client.storage.from("avatars").remove([path]);
        throw new Error("save failed");
      }
      setFailed(false); setUrl(next);
      setNotice("Logo enregistré. Il apparaît sur votre profil public et vos publications dans le feed.");
    } catch { setNotice("Le logo n’a pas pu être enregistré. Réessayez ; votre ancien logo est conservé."); }
    finally { setBusy(false); }
  }
  return <section aria-label="Logo professionnel" className="panel">
    <h3>Mon logo professionnel</h3>
    <p>Votre logo est affiché sur votre profil public, dans le feed et sur vos réservations.</p>
    {url && !failed ? <Image src={url} alt="Logo professionnel" width={96} height={96} unoptimized onError={() => setFailed(true)} style={{ objectFit: "contain", background: "white", borderRadius: 12 }} /> : <p>{failed ? "L’image actuelle est indisponible. Ajoutez-la à nouveau ci-dessous." : "Aucun logo enregistré."}</p>}
    <label>Ajouter ou remplacer le logo<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) void upload(file); }} /></label>
    <small>JPG, PNG ou WebP · 5 Mo maximum</small>
    {busy && <p role="status">Enregistrement du logo…</p>}
    {notice && <p role="status">{notice}</p>}
  </section>;
}
