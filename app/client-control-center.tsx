"use client";
import { uploadProfileImage } from "@/lib/media/image-upload-client";
import { PhoneInput } from "./phone-input";
import "./client-profile-editor.css";
import { ClientReviewBookings } from "./client-review-bookings";
import { workspaceText } from "@/lib/domain/workspace-copy";
import { useApplicationLocale } from "./use-application-locale";

import Link from "next/link";
import { SupportThread } from "./support-inbox";

import Image from "next/image";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { publicErrorMessage } from "@/lib/ui/public-error";
import { QueryTimeoutError, withQueryTimeout } from "@/lib/domain/query-timeout";
import { SUPPORTED_COUNTRIES, SUPPORTED_LANGUAGES } from "@/lib/domain/international";

type Identity = { display_name?: string | null; first_name: string | null; last_name: string | null; username: string | null; phone: string | null; bio: string | null; avatar_url: string | null; locale: string | null; country_code: string | null; city: string | null; neighborhood: string | null; region: string | null };
type Payment = { is_test: boolean; provider: string; id: string; amount: number; currency: string; payment_method: string; payment_status: string; provider_reference: string | null; created_at: string; bookings: { provider_services: { title: string } | null } | null };
type Review = { collaborator_name: string | null; id: string; rating: number; comment: string | null; provider_reply: string | null; is_visible: boolean; created_at: string };
type Ticket = { id: string; subject: string; status: string; created_at: string };
type Counts = { follows: number; saves: number; bookings: number };
type ReviewsState = "loading" | "ready" | "error";
const REVIEWS_QUERY_TIMEOUT_MS = 12_000;

const paymentLabels: Record<string,string> = { pending:"À payer", simulated_paid:"Confirmé (test)", paid_on_site:"Confirmé sur place", paid:"Confirmé", failed:"Échoué", refunded:"Remboursé", cancelled:"Annulé" };

export function ClientControlCenter({ userId, section = "settings", embedded = false, personalAccount = false, onProfileUpdated }: { userId: string; section?: string; embedded?: boolean; personalAccount?: boolean; onProfileUpdated?: () => void }) {
  const locale = useApplicationLocale();
  const t = (text: string) => workspaceText(text, locale);
  const [identity,setIdentity]=useState<Identity|null>(null);
  const [counts,setCounts]=useState<Counts>({follows:0,saves:0,bookings:0});
  const [payments,setPayments]=useState<Payment[]>([]);
  const [paymentsState,setPaymentsState]=useState<ReviewsState>("loading");
  const [ticketsState,setTicketsState]=useState<ReviewsState>("loading");
  const [reviews,setReviews]=useState<Review[]>([]);
  const [reviewsState,setReviewsState]=useState<ReviewsState>("loading");
  const [reviewsError,setReviewsError]=useState("");
  const reviewsRequest=useRef<AbortController|null>(null);
  const [selectedTicket,setSelectedTicket]=useState<string|null>(null);
  const [tickets,setTickets]=useState<Ticket[]>([]);
  const [privacy,setPrivacy]=useState({profile_visibility:"limited",show_collections:false,show_follows:false,allow_personalized_recommendations:true,allow_marketing_email:false,allow_promotional_notifications:false});
  const [preferences,setPreferences]=useState({favorite_categories:[] as string[],preferred_styles:[] as string[],budget_min:"",budget_max:"",radius_km:15,location_mode:"both",personalization_enabled:true});
  const [notice,setNotice]=useState("");
  const [savingIdentity,setSavingIdentity]=useState(false), [uploadingAvatar,setUploadingAvatar]=useState(false);
  const identityLock=useRef(false), avatarLock=useRef(false);

  const load=useCallback(async()=>{
    const supabase=getSupabaseBrowserClient();
    if(!supabase) {
      if(section === "reviews") { setReviewsError("Le service des avis est momentanément indisponible."); setReviewsState("error"); }
      setNotice("Reconnectez-vous pour accéder à votre compte."); setPaymentsState("error"); setTicketsState("error");
      return;
    }
    if(section === "reviews") {
      reviewsRequest.current?.abort();
      const controller = new AbortController();
      reviewsRequest.current = controller;
      setReviewsState("loading");
      setReviewsError("");
      try {
        const result = await withQueryTimeout(
          (signal) => supabase.from("reviews")
            .select("id,rating,comment,provider_reply,is_visible,created_at,collaborator_name")
            .eq("client_id", userId)
            .order("created_at", { ascending: false })
            .limit(100)
            .abortSignal(signal),
          REVIEWS_QUERY_TIMEOUT_MS,
          controller.signal,
        );
        if (reviewsRequest.current !== controller) return;
        if (result.error) {
          setReviewsError(publicErrorMessage(result.error, "Les avis n’ont pas pu être chargés."));
          setReviewsState("error");
          return;
        }
        setReviews((result.data ?? []) as Review[]);
        setReviewsState("ready");
      } catch (error) {
        if (reviewsRequest.current !== controller) return;
        if (error instanceof QueryTimeoutError) setReviewsError("Le chargement des avis prend trop de temps. Réessayez.");
        else if (error instanceof DOMException && error.name === "AbortError") return;
        else setReviewsError(publicErrorMessage(error, "Les avis n’ont pas pu être chargés."));
        setReviewsState("error");
      } finally {
        if (reviewsRequest.current === controller) reviewsRequest.current = null;
      }
      return;
    }
    if(section === "payments") {
      setPaymentsState("loading");
      try {
        const result = await supabase.from("payments").select("id,amount,currency,is_test,provider,payment_method,payment_status,provider_reference,created_at,bookings!inner(client_id,provider_services(title))").eq("bookings.client_id",userId).order("created_at",{ascending:false}).limit(20).abortSignal(AbortSignal.timeout(12000));
        if(result.error) throw result.error;
        setPayments((result.data??[]) as unknown as Payment[]); setPaymentsState("ready");
      } catch { setPayments([]); setPaymentsState("error"); }
      return;
    }
    if(section === "support") {
      setTicketsState("loading");
      try {
        const result = await supabase.from("support_tickets").select("id,subject,status,created_at").eq("requester_id",userId).order("created_at",{ascending:false}).limit(10).abortSignal(AbortSignal.timeout(12000));
        if(result.error) throw result.error;
        setTickets((result.data??[]) as Ticket[]); setTicketsState("ready");
      } catch { setTickets([]); setTicketsState("error"); }
      return;
    }
    reviewsRequest.current?.abort();
    setPaymentsState("loading"); setTicketsState("loading");
    try {
    await supabase.rpc("initialize_client_control_center").abortSignal(AbortSignal.timeout(12000));
    const [profile,client,followCount,saveCount,bookingCount,paymentRows,ticketRows,privacyRow,preferenceRow]=await Promise.all([
      supabase.rpc("get_my_private_profile").abortSignal(AbortSignal.timeout(12000)),
      supabase.from("client_profiles").select("city,neighborhood,region").eq("profile_id",userId).abortSignal(AbortSignal.timeout(12000)).maybeSingle(),
      supabase.from("follows").select("follower_id",{count:"exact",head:true}).eq("follower_id",userId).abortSignal(AbortSignal.timeout(12000)),
      supabase.from("post_saves").select("post_id",{count:"exact",head:true}).eq("profile_id",userId).abortSignal(AbortSignal.timeout(12000)),
      supabase.from("bookings").select("id",{count:"exact",head:true}).eq("client_id",userId).abortSignal(AbortSignal.timeout(12000)),
      supabase.from("payments").select("id,amount,currency,is_test,provider,payment_method,payment_status,provider_reference,created_at,bookings!inner(client_id,provider_services(title))").eq("bookings.client_id",userId).order("created_at",{ascending:false}).limit(20).abortSignal(AbortSignal.timeout(12000)),
      supabase.from("support_tickets").select("id,subject,status,created_at").eq("requester_id",userId).order("created_at",{ascending:false}).limit(10).abortSignal(AbortSignal.timeout(12000)),
      supabase.from("profile_privacy_settings").select("*").eq("profile_id",userId).abortSignal(AbortSignal.timeout(12000)).single(),
      supabase.from("profile_preferences").select("*").eq("profile_id",userId).abortSignal(AbortSignal.timeout(12000)).single(),
    ]);
    if(profile.error || client.error) setNotice("Votre profil est momentanément indisponible.");
    if(profile.data && !client.error)setIdentity({...profile.data,...(client.data ?? {})} as Identity);
    setCounts({follows:followCount.count??0,saves:saveCount.count??0,bookings:bookingCount.count??0});
    setPayments(paymentRows.error ? [] : (paymentRows.data??[]) as unknown as Payment[]); setPaymentsState(paymentRows.error ? "error" : "ready");
    setTickets(ticketRows.error ? [] : (ticketRows.data??[]) as Ticket[]); setTicketsState(ticketRows.error ? "error" : "ready");
    if(privacyRow.data&&!Array.isArray(privacyRow.data))setPrivacy(privacyRow.data); if(preferenceRow.data&&!Array.isArray(preferenceRow.data))setPreferences({...preferenceRow.data,favorite_categories:preferenceRow.data.favorite_categories??[],preferred_styles:preferenceRow.data.preferred_styles??[],budget_min:preferenceRow.data.budget_min?.toString()??"",budget_max:preferenceRow.data.budget_max?.toString()??""});
    } catch { setPayments([]); setTickets([]); setPaymentsState("error"); setTicketsState("error"); setNotice("Les données de votre espace sont indisponibles. Réessayez."); }
  },[section,userId]);
  useEffect(()=>{const timer=window.setTimeout(()=>void load(),0);return()=>{window.clearTimeout(timer);reviewsRequest.current?.abort();};},[load]);

  const initials=useMemo(()=>`${identity?.first_name?.[0]??"M"}${identity?.last_name?.[0]??"B"}`,[identity]);
  async function saveIdentity(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); if(identityLock.current) return;
    const supabase=getSupabaseBrowserClient(); if(!supabase) { setNotice("Reconnectez-vous pour modifier votre profil."); return; }
    const values=new FormData(event.currentTarget), countryCode=String(values.get("countryCode")??""), language=String(values.get("language")??"fr");
    identityLock.current=true; setSavingIdentity(true); setNotice("");
    try {
      const result=await supabase.rpc("update_client_identity_global",{target_first_name:String(values.get("firstName")??"").trim(),target_last_name:String(values.get("lastName")??"").trim(),target_username:String(values.get("username")??"").trim(),target_phone:String(values.get("phone")??""),target_bio:String(values.get("bio")??""),target_city:String(values.get("city")??""),target_neighborhood:String(values.get("neighborhood")??""),target_locale:`${language}-${countryCode}`,target_country_code:countryCode,target_region:String(values.get("region")??"")}).abortSignal(AbortSignal.timeout(12000));
      if(result.error) throw result.error;
      setNotice("Profil mis à jour.");
      window.dispatchEvent(new CustomEvent("mata:locale-changed",{detail:`${language}-${countryCode}`}));
      await load(); window.dispatchEvent(new Event("mata-profile-updated")); onProfileUpdated?.();
    } catch(error) { setNotice(publicErrorMessage(error,"Le profil n’a pas pu être mis à jour. Vérifiez votre connexion et réessayez.")); }
    finally { identityLock.current=false; setSavingIdentity(false); }
  }
  async function uploadAvatar(file:File) {
    if(avatarLock.current) return;
    const supabase=getSupabaseBrowserClient(); if(!supabase) { setNotice("Reconnectez-vous pour modifier votre photo."); return; }
    if(!file.size||file.size>4*1024*1024||!["image/jpeg","image/png","image/webp"].includes(file.type)) { setNotice("Photo JPG, PNG ou WebP de 4 Mo maximum."); return; }
    avatarLock.current=true; setUploadingAvatar(true); setNotice("");
    try {
      const avatar_url=await uploadProfileImage(file,"avatar");
      setIdentity(current=>current?{...current,avatar_url}:current);
      setNotice("Photo mise à jour."); window.dispatchEvent(new Event("mata-profile-updated")); onProfileUpdated?.();
    } catch(error) { setNotice(publicErrorMessage(error,"La photo n’a pas pu être enregistrée. Réessayez.")); }
    finally { avatarLock.current=false; setUploadingAvatar(false); }
  }
  async function savePreferences(event:FormEvent<HTMLFormElement>){event.preventDefault();const supabase=getSupabaseBrowserClient();if(!supabase)return;const v=new FormData(event.currentTarget);const row={profile_id:userId,favorite_categories:String(v.get("categories")??"").split(',').map(x=>x.trim()).filter(Boolean),preferred_styles:String(v.get("styles")??"").split(',').map(x=>x.trim()).filter(Boolean),budget_min:Number(v.get("budgetMin"))||null,budget_max:Number(v.get("budgetMax"))||null,radius_km:Number(v.get("radius"))||15,location_mode:String(v.get("locationMode")),personalization_enabled:v.get("personalization")==="on",updated_at:new Date().toISOString()};const {error}=await supabase.from("profile_preferences").upsert(row);setNotice(error?publicErrorMessage(error,"Les préférences n’ont pas pu être enregistrées."):"Préférences enregistrées.");}
  async function savePrivacy(){const supabase=getSupabaseBrowserClient();if(!supabase)return;const {error}=await supabase.from("profile_privacy_settings").upsert({...privacy,profile_id:userId,updated_at:new Date().toISOString()});setNotice(error?publicErrorMessage(error,"Les réglages de confidentialité n’ont pas pu être enregistrés."):"Confidentialité enregistrée.");}
  const ticketPending = useRef(false);
  const [savingTicket, setSavingTicket] = useState(false);
  async function createTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (ticketPending.current) return;
    ticketPending.current = true; setSavingTicket(true);
    try { await createTicketUnlocked(event); }
    catch { setNotice("Enregistrement non confirmé. Actualisez avant de réessayer."); }
    finally { ticketPending.current = false; setSavingTicket(false); }
  }
  async function createTicketUnlocked(event:FormEvent<HTMLFormElement>){event.preventDefault();const supabase=getSupabaseBrowserClient();if(!supabase)return;const form=event.currentTarget;const v=new FormData(form);const launchCategory=String(v.get("category"));const enriched={requester_id:userId,subject:String(v.get("subject")),category:launchCategory,launch_category:launchCategory};let {error}=await supabase.from("support_tickets").insert(enriched);if(error?.code==="PGRST204")({error}=await supabase.from("support_tickets").insert({requester_id:userId,subject:String(v.get("subject")),category:launchCategory}));setNotice(error?publicErrorMessage(error,"La demande n’a pas pu être envoyée."):"Demande envoyée au support.");if(!error){form.reset();await load();}}
  async function requestDeletion(){if(!window.confirm(t("Demander la suppression du compte ? Cette demande sera vérifiée avant toute action irréversible.")))return;const reason=window.prompt(t("Motif facultatif"));if(reason===null)return;const supabase=getSupabaseBrowserClient();if(!supabase)return;const {error}=await supabase.rpc("request_account_deletion",{target_reason:reason});setNotice(error?publicErrorMessage(error,"La demande de suppression n’a pas pu être enregistrée."):"Demande enregistrée. Aucune donnée n’est supprimée immédiatement.");}

  if(section === "reviews") return <section className="client-control-center" id="client-reviews">
    <ClientReviewBookings clientId={userId} />
    <article className="panel"><div className="panel-heading"><div><h2>Historique des avis précédents</h2><p>Seules les réservations terminées peuvent recevoir le badge Réservation vérifiée.</p></div></div>
      {reviewsState === "loading" ? <div className="compact-empty" role="status">Chargement de vos avis…</div>
        : reviewsState === "error" ? <div className="compact-empty" role="alert"><p>{t(reviewsError)}</p><button type="button" onClick={() => void load()}>{t("Réessayer")}</button></div>
        : reviews.length ? reviews.map(r=><div className="control-list-row" key={r.id}><div><strong>{'★'.repeat(r.rating)} · Réservation vérifiée</strong><small>{r.comment??"Sans commentaire"}</small>{r.collaborator_name && <small>Prestation réalisée par {r.collaborator_name}</small>}{r.provider_reply&&<p>Réponse du professionnel : {r.provider_reply}</p>}</div><span>{r.is_visible?"Publié":"Modéré"}</span></div>)
        : <div className="compact-empty">Aucun avis publié.</div>}
    </article>
  </section>;
  if(!identity && section === "settings")return <article className="panel"><div className="compact-empty">{notice || t("Chargement de votre profil…")}</div>{notice && <button onClick={() => void load()}>{t("Réessayer")}</button>}</article>;
  return <section className={`client-control-center${section === "settings" ? " client-settings-editor" : ""}`} id="client-profile">
    {!embedded && section === "settings" && identity && <article className="panel client-profile-hero"><div className="client-avatar">{identity.avatar_url?<Image src={identity.avatar_url} alt={t("Photo de profil")} width={88} height={88} unoptimized />:initials}<label aria-label="Modifier la photo"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>e.target.files?.[0]&&void uploadAvatar(e.target.files[0])}/>＋</label></div><div><small>MON PROFIL</small><h2>{[identity.first_name, identity.last_name].filter(Boolean).join(" ").trim() || identity.display_name?.trim() || t("Mon profil")}</h2><p>@{identity.username??"nom_utilisateur"} · {[identity.neighborhood,identity.city].filter(Boolean).join(', ')||"Localisation à compléter"}</p><span>{identity.bio||"Ajoutez une courte bio pour personnaliser votre espace."}</span></div><button onClick={()=>document.getElementById("edit-client-profile")?.scrollIntoView({behavior:"smooth"})}>Modifier le profil</button><button onClick={()=>document.getElementById("privacy-settings")?.scrollIntoView({behavior:"smooth"})}>{t("Paramètres")}</button><div className="client-profile-counts"><b>{counts.follows}<small>Suivis</small></b><b>{counts.saves}<small>Vidéos enregistrées</small></b><b>{counts.bookings}<small>{t("Réservations")}</small></b></div></article>}
    {!embedded && <nav className="profile-shortcuts" aria-label={t("Paramètres et confidentialité")}><Link href="/app/profile">{t("← Retour au profil")}</Link><Link href="/app/settings">{t("Compte et confidentialité")}</Link><Link href="/app/notifications">{t("Notifications")}</Link><Link href="/app/payments">{t("Mes paiements")}</Link><Link href="/app/reviews">{t("Mes avis")}</Link><Link href="/app/support">{t("Aide")}</Link></nav>}
    {notice&&<p className="dashboard-feedback" role="status">{t(notice)}</p>}
    {section === "settings" && identity && <article className="panel" id="edit-client-profile"><div className="panel-heading"><div><h2>{t("Identité")}</h2><p>{t("Les coordonnées privées ne sont jamais affichées publiquement.")}</p></div></div><div className="client-photo-editor">{identity.avatar_url ? <Image src={identity.avatar_url} alt="Photo de profil actuelle" width={88} height={88} unoptimized /> : <span className="client-photo-initials" aria-label="Initiales du profil">{initials}</span>}<label className="client-photo-picker">{uploadingAvatar ? "Enregistrement de la photo…" : "Changer ma photo de profil"}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploadingAvatar} onChange={event=>{const file=event.currentTarget.files?.[0];event.currentTarget.value="";if(file)void uploadAvatar(file);}} /></label><small>JPG, PNG ou WebP · 4 Mo maximum</small></div><form className="dashboard-form" onSubmit={e=>void saveIdentity(e)}><label>{t("Prénom")}<input name="firstName" autoComplete="given-name" maxLength={100} required defaultValue={identity.first_name??""}/></label><label>{t("Nom")}<input name="lastName" autoComplete="family-name" maxLength={100} required defaultValue={identity.last_name??""}/></label><label>{t("Nom d’utilisateur")}<input name="username" autoComplete="username" title="3 à 30 lettres, chiffres ou traits de soulignement, sans espace." required pattern="[A-Za-z0-9_]{3,30}" defaultValue={identity.username??""}/></label><PhoneInput label={t("Téléphone")} defaultValue={identity.phone} defaultCountry={identity.country_code}/><label>{t("Pays")}<select name="countryCode" required defaultValue={identity.country_code??""}><option value="">{t("Choisir un pays")}</option>{SUPPORTED_COUNTRIES.map(country => <option key={country.code} value={country.code}>{new Intl.DisplayNames([locale], { type: "region" }).of(country.code) ?? country.name}</option>)}</select></label><label>{t("Région / État")}<input name="region" maxLength={120} defaultValue={identity.region??""}/></label><label>{t("Ville")}<input name="city" autoComplete="address-level2" defaultValue={identity.city??""}/></label><label>{t("Quartier")}<input name="neighborhood" defaultValue={identity.neighborhood??""}/></label><label>{t("Langue")}<select name="language" defaultValue={identity.locale?.split("-")[0]??"fr"}>{SUPPORTED_LANGUAGES.map(language => <option key={language.code} value={language.code}>{language.label}</option>)}</select></label><label className="wide">{t("Bio")}<textarea name="bio" maxLength={280} defaultValue={identity.bio??""}/></label><button className="primary-button" disabled={savingIdentity}>{savingIdentity ? "Enregistrement…" : t("Enregistrer")}</button></form></article>}
    {section === "settings" && <article className="panel" id="beauty-preferences"><div className="panel-heading"><div><h2>{t("Préférences beauté")}</h2><p>{t("Utilisées uniquement pour personnaliser le feed lorsque vous l’autorisez.")}</p></div></div><form className="dashboard-form" onSubmit={e=>void savePreferences(e)}><label className="wide">{t("Catégories favorites")}<input name="categories" defaultValue={preferences.favorite_categories.join(', ')}/></label><label className="wide">{t("Styles préférés")}<input name="styles" defaultValue={preferences.preferred_styles.join(', ')}/></label><label>{t("Budget minimum")}<input name="budgetMin" type="number" min="0" defaultValue={preferences.budget_min}/></label><label>{t("Budget maximum")}<input name="budgetMax" type="number" min="0" defaultValue={preferences.budget_max}/></label><label>{t("Rayon (km)")}<input name="radius" type="number" min="1" max="200" defaultValue={preferences.radius_km}/></label><label>{t("Lieu")}<select name="locationMode" defaultValue={preferences.location_mode}><option value="both">{t("Salon ou domicile")}</option><option value="salon">{t("Salon")}</option><option value="mobile">{t("Domicile")}</option></select></label><label className="wide legal-consent"><input name="personalization" type="checkbox" defaultChecked={preferences.personalization_enabled}/><span>{t("Activer les recommandations personnalisées")}</span></label><button className="primary-button">{t("Enregistrer")}</button></form></article>}
    {section === "payments" && <article className="panel" id="client-payments"><div className="panel-heading"><div><h2>{t("Mes paiements")}</h2><p>{t("Historique privé lié à vos réservations.")}</p></div></div>{paymentsState === "loading" ? <p role="status">Chargement des paiements…</p> : paymentsState === "error" ? <div role="alert"><p>Les paiements n’ont pas pu être chargés.</p><button type="button" onClick={() => void load()}>Réessayer</button></div> : payments.length?payments.map(p=><div className="control-list-row" key={p.id}><div><strong>{p.bookings?.provider_services?.title??t("Prestation beauté")}</strong><small>{new Date(p.created_at).toLocaleDateString(locale)} · {p.payment_method.replaceAll('_',' ')}</small>{(p.is_test || p.provider === "mock" || p.payment_status === "simulated_paid") && <small>Paiement de test · aucun argent réel</small>}<code>{p.provider_reference??p.id.slice(0,12)}</code></div><b>{p.amount.toLocaleString(locale)} {p.currency}<small>{t(paymentLabels[p.payment_status]??p.payment_status)}</small></b></div>):<div className="compact-empty">{t("Aucun paiement enregistré.")}</div>}</article>}
    {section === "support" && <article className="panel" id="client-support"><div className="panel-heading"><div><h2>{t("Aide et support")}</h2><p>{t("Une demande privée suivie par l’équipe Mata Beauty.")}</p></div></div><form className="collection-form" onSubmit={e=>void createTicket(e)}><label>{t("Catégorie")}<select name="category"><option value="signup">{t("Inscription")}</option><option value="profile">{t("Profil")}</option><option value="publication">{t("Publication")}</option><option value="booking">{t("Réservation")}</option><option value="payment">{t("Paiement")}</option><option value="bug">{t("Bug")}</option><option value="other">{t("Autre")}</option></select></label><label>{t("Objet (obligatoire)")}<input name="subject" required minLength={3} maxLength={160} placeholder={t("Décrivez brièvement votre demande")}/></label><button disabled={savingTicket}>{t(savingTicket ? "Envoi…" : "Envoyer")}</button></form>{ticketsState === "loading" && <p role="status">Chargement des demandes…</p>}{ticketsState === "error" && <div role="alert"><p>Les demandes de support n’ont pas pu être chargées.</p><button type="button" onClick={() => void load()}>Réessayer</button></div>}{tickets.map(ticket=><div className="control-list-row" key={ticket.id}><button onClick={()=>setSelectedTicket(ticket.id)}>{ticket.subject}</button><span>{ticket.status}</span></div>)}{selectedTicket && <SupportThread key={selectedTicket} ticketId={selectedTicket} onChange={load}/>}</article>}
    {section === "settings" && <article className="panel" id="privacy-settings"><div className="panel-heading"><div><h2>{t("Confidentialité et compte")}</h2><p>{t("Vos paiements, réservations, messages et tickets restent toujours privés.")}</p></div></div><div className="privacy-grid"><label>{t("Visibilité du profil")}<select value={privacy.profile_visibility} onChange={e=>setPrivacy({...privacy,profile_visibility:e.target.value})}><option value="limited">{t("Limitée")}</option><option value="public">{t("Publique")}</option></select></label>{([['show_collections',t("Afficher mes collections")],['show_follows',t("Afficher mes abonnements")],['allow_personalized_recommendations',t("Recommandations personnalisées")],['allow_marketing_email',t("Emails commerciaux")],['allow_promotional_notifications',t("Notifications promotionnelles")]] as const).map(([key,label])=><label className="legal-consent" key={key}><input type="checkbox" checked={privacy[key]} onChange={e=>setPrivacy({...privacy,[key]:e.target.checked})}/><span>{t(label)}</span></label>)}</div><div className="privacy-actions"><button className="primary-button" onClick={()=>void savePrivacy()}>{t("Enregistrer")}</button>{!personalAccount && <Link href="/app/application">{t("Ma candidature professionnelle")}</Link>}<button className="danger-button" onClick={()=>void requestDeletion()}>{t("Demander la suppression du compte")}</button></div></article>}
  </section>;
}
