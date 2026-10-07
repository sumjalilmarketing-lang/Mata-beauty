"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRef, useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { authErrorMessage } from "@/lib/auth/errors";
import { meetsPasswordPolicy, passwordPolicyMessage } from "@/lib/auth/password-policy";
import { ensureAuthenticatedProfile, type AuthenticatedProfile } from "@/lib/auth/profile";
import { safeOAuthDestination } from "@/lib/auth/redirect";
import { isGoogleAuthEnabled } from "@/lib/auth/providers";
import { getSupabaseBrowserClient, getSupabaseConfiguration } from "@/lib/supabase/client";

const authSchema = z.object({
  displayName: z.string().trim().max(80).optional(),
  email: z.email("Adresse e-mail invalide."),
  password: z.string().optional(),
  confirmation: z.string().optional(),
  acceptLegal: z.boolean().optional(),
});

type AuthValues = z.infer<typeof authSchema>;
type AuthMode = "login" | "register" | "reset";
export type { AuthenticatedProfile } from "@/lib/auth/profile";

export function AuthModal({
  initialMode = "login",
  intendedRole = "client",
  returnTo = "/",
  onClose,
  onAuthenticated,
}: {
  initialMode?: AuthMode;
  intendedRole?: "client" | "provider";
  returnTo?: string;
  onClose: () => void;
  onAuthenticated: (profile: AuthenticatedProfile) => void;
}) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [feedback, setFeedback] = useState("");
  const [googleLoading, setGoogleLoading] = useState(false);
  const submitting = useRef(false);
  const openingGoogle = useRef(false);
  const configuration = getSupabaseConfiguration();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AuthValues>({
    resolver: zodResolver(authSchema),
    defaultValues: { displayName: "", email: "", password: "", confirmation: "", acceptLegal: false },
  });

  async function submit(values: AuthValues) {
    if (submitting.current || openingGoogle.current) return;
    setFeedback("");
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setFeedback("Connexion Supabase indisponible : la clé publique n’est pas configurée.");
      return;
    }
    submitting.current = true;
    try {
      if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(values.email, {
          redirectTo: `${window.location.origin}/auth/update-password`,
        });
        if (error) throw error;
        setFeedback("Si un compte correspond à cette adresse, vous recevrez un lien de réinitialisation. Consultez aussi vos courriers indésirables.");
        return;
      }

      if (mode === "register") {
        if (!values.displayName?.trim()) {
          setFeedback("Saisissez votre nom complet.");
          return;
        }
        if (!values.password || !meetsPasswordPolicy(values.password)) {
          setFeedback(passwordPolicyMessage);
          return;
        }
        if (!values.acceptLegal) {
          setFeedback("Vous devez accepter les conditions et la politique de confidentialité.");
          return;
        }
        if (values.password !== values.confirmation) {
          setFeedback("Les mots de passe ne correspondent pas.");
          return;
        }
        const { data, error } = await supabase.auth.signUp({
          email: values.email,
          password: values.password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/confirm`,
            data: {
              professional_intent: false,
              display_name: values.displayName?.trim() || values.email.split("@")[0],
              legal_accepted: true,
            },
          },
        });
        if (error) throw error;
        if (!data.session) {
          setFeedback("Consultez votre boîte e-mail pour confirmer votre inscription. Si vous possédez déjà un compte, connectez-vous ou utilisez « Mot de passe oublié ».");
          setMode("login");
          reset({ ...values, password: "", confirmation: "" });
          return;
        }
      } else {
        if (!values.password) {
          setFeedback("Saisissez votre mot de passe.");
          return;
        }
        const { error } = await supabase.auth.signInWithPassword({
          email: values.email,
          password: values.password,
        });
        if (error) throw error;
      }

      const { data: userData, error: userError } = await supabase.auth.getUser();
      const user = userData.user;
      if (userError) throw userError;
      if (!user) throw new Error("La session n’a pas pu être créée.");
      const { error: statusError } = await supabase.rpc("synchronize_account_status");
      if (statusError) throw statusError;
      if (intendedRole === "provider") {
        const { error } = await supabase.rpc("request_professional_profile");
        if (error) throw error;
      }
      const profile = await ensureAuthenticatedProfile(supabase, user.id);
      const { data: currentSession } = await supabase.auth.getSession();
      if (currentSession.session) {
        await fetch("/api/auth/welcome", { method: "POST", signal: AbortSignal.timeout(12_000), headers: { Authorization: `Bearer ${currentSession.session.access_token}` } })
          .catch(() => console.warn("welcome_email_request_pending"));
      }
      onAuthenticated(profile);
    } catch (error) {
      setFeedback(authErrorMessage(error));
    } finally {
      submitting.current = false;
    }
  }

  async function continueWithGoogle() {
    if (openingGoogle.current || submitting.current) return;
    openingGoogle.current = true;
    setFeedback("");
    setGoogleLoading(true);
    try {
    if (!await isGoogleAuthEnabled()) {
      setFeedback("La connexion Google n’est pas encore activée pour Mata Beauty. Utilisez votre e-mail pour le moment.");
      setGoogleLoading(false);
      return;
    }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setFeedback("Connexion Supabase indisponible.");
      setGoogleLoading(false);
      return;
    }
    const intent = intendedRole === "provider" ? "professional" : "client";
    const redirectTo = new URL("/auth/callback", window.location.origin);
    redirectTo.searchParams.set("intent", intent);
    redirectTo.searchParams.set("next", safeOAuthDestination(returnTo));
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: redirectTo.toString(), scopes: "openid email profile" },
    });
    if (error) {
      throw error;
    }
    } catch (error: unknown) {
      setFeedback(authErrorMessage(error));
    } finally {
      openingGoogle.current = false;
      setGoogleLoading(false);
    }
  }

  const title = mode === "login" ? "Se connecter" : mode === "register" ? "Créer votre compte Client" : "Mot de passe oublié";

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button className="modal-close" onClick={onClose} aria-label="Fermer">×</button>
        <div className="auth-brand"><span>M</span><div><strong>MATA</strong><small>BEAUTY</small></div></div>
        <p className="eyebrow">Compte sécurisé</p>
        <h2 id="auth-title">{title}</h2>
        <p className="auth-lead">{mode === "login" ? "Retrouvez vos rendez-vous, favoris et recommandations personnalisées." : mode === "register" ? "Rejoignez l’expérience beauté premium pensée pour vous." : "Nous vous aidons à retrouver rapidement votre espace."}</p>
        {!configuration.configured && (
          <div className="configuration-warning" role="alert">
            La connexion sécurisée est momentanément indisponible. Réessayez ultérieurement.
          </div>
        )}
        {mode !== "reset" && <>
          <button className="google-auth-button" type="button" onClick={() => void continueWithGoogle()} disabled={googleLoading || isSubmitting || !configuration.configured}>
            <span aria-hidden="true">G</span>{googleLoading ? "Ouverture de Google…" : "Continuer avec Google"}
          </button>
          <div className="auth-divider"><span>ou avec votre e-mail</span></div>
        </>}
        <form onSubmit={(event) => void handleSubmit(submit)(event)} noValidate>
          {mode === "register" && (
            <label>
              Nom complet
              <input autoComplete="name" {...register("displayName")} />
            </label>
          )}
          <label>
            Adresse e-mail
            <input type="email" autoComplete="email" aria-invalid={Boolean(errors.email)} {...register("email")} />
            {errors.email && <small className="field-error">{errors.email.message}</small>}
          </label>
          {mode !== "reset" && (
            <label>
              Mot de passe
              <input
                type="password"
                autoComplete={mode === "register" ? "new-password" : "current-password"}
                aria-invalid={Boolean(errors.password)}
                {...register("password")}
              />
              {errors.password && <small className="field-error">{errors.password.message}</small>}
            </label>
          )}
          {mode === "register" && <>
            <label>Confirmer le mot de passe<input type="password" autoComplete="new-password" {...register("confirmation")} /></label>
            <label className="legal-consent"><input type="checkbox" aria-label="Accepter les conditions générales et la politique de confidentialité" {...register("acceptLegal")} /> <span>J’accepte les <Link href="/legal/conditions-generales" target="_blank" rel="noopener noreferrer">conditions générales</Link> et la <Link href="/legal/confidentialite" target="_blank" rel="noopener noreferrer">politique de confidentialité</Link> de Mata Beauty.</span></label>
          </>}
          {feedback && <p className="auth-feedback" role="status">{feedback}</p>}
          <button className="primary-button full" type="submit" disabled={isSubmitting || googleLoading || !configuration.configured}>
            {isSubmitting ? "Veuillez patienter…" : mode === "login" ? "Se connecter" : mode === "register" ? "Créer le compte" : "Envoyer le lien"}
          </button>
        </form>
        <div className="auth-links">
          {mode !== "login" && <button onClick={() => setMode("login")}>Déjà inscrit ? Se connecter</button>}
          {mode === "login" && <button onClick={() => setMode("register")}>Créer un compte</button>}
          {mode === "login" && <button onClick={() => setMode("reset")}>Mot de passe oublié</button>}
        </div>
      </section>
    </div>
  );
}
