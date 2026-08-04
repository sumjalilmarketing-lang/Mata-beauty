"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { loadAuthenticatedProfile, type AuthenticatedProfile } from "@/lib/auth/profile";
import { isGoogleAuthEnabled } from "@/lib/auth/providers";
import { getSupabaseBrowserClient, getSupabaseConfiguration } from "@/lib/supabase/client";

const authSchema = z.object({
  displayName: z.string().trim().max(80).optional(),
  email: z.email("Adresse e-mail invalide."),
  password: z.string().min(8, "Le mot de passe doit contenir au moins 8 caractères."),
  acceptLegal: z.boolean().optional(),
});

type AuthValues = z.infer<typeof authSchema>;
type AuthMode = "login" | "register" | "reset";
export type { AuthenticatedProfile } from "@/lib/auth/profile";

export function AuthModal({
  initialMode = "login",
  intendedRole = "client",
  onClose,
  onAuthenticated,
}: {
  initialMode?: AuthMode;
  intendedRole?: "client" | "provider";
  onClose: () => void;
  onAuthenticated: (profile: AuthenticatedProfile) => void;
}) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [feedback, setFeedback] = useState("");
  const [googleLoading, setGoogleLoading] = useState(false);
  const configuration = getSupabaseConfiguration();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AuthValues>({
    resolver: zodResolver(authSchema),
    defaultValues: { displayName: "", email: "", password: "", acceptLegal: false },
  });

  async function submit(values: AuthValues) {
    setFeedback("");
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setFeedback("Connexion Supabase indisponible : la clé publique n’est pas configurée.");
      return;
    }
    try {
      if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(values.email, {
          redirectTo: `${window.location.origin}/auth/update-password`,
        });
        if (error) throw error;
        setFeedback("Un lien de réinitialisation vient d’être envoyé.");
        return;
      }

      if (mode === "register") {
        if (!values.acceptLegal) {
          setFeedback("Vous devez accepter les conditions et la politique de confidentialité.");
          return;
        }
        const { data, error } = await supabase.auth.signUp({
          email: values.email,
          password: values.password,
          options: {
            data: {
              professional_intent: intendedRole === "provider",
              display_name: values.displayName?.trim() || values.email.split("@")[0],
              legal_accepted: true,
            },
          },
        });
        if (error) throw error;
        if (!data.session) {
          setFeedback("Compte créé. Confirmez votre adresse e-mail avant de vous connecter.");
          setMode("login");
          reset({ ...values, password: "" });
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: values.email,
          password: values.password,
        });
        if (error) throw error;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (!user) throw new Error("La session n’a pas pu être créée.");
      await supabase.rpc("synchronize_account_status");
      await supabase.rpc("ensure_authenticated_profile");
      if (intendedRole === "provider") await supabase.rpc("request_professional_profile");
      onAuthenticated(await loadAuthenticatedProfile(supabase, user.id));
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "L’opération a échoué. Réessayez.");
    }
  }

  async function continueWithGoogle() {
    setFeedback("");
    setGoogleLoading(true);
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
    redirectTo.searchParams.set("next", "/");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: redirectTo.toString(), scopes: "openid email profile" },
    });
    if (error) {
      setFeedback("La connexion Google n’a pas pu démarrer. Réessayez.");
      setGoogleLoading(false);
    }
  }

  const title = mode === "login" ? "Bienvenue" : mode === "register" ? "Créer votre compte" : "Mot de passe oublié";

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
        <form onSubmit={handleSubmit(submit)} noValidate>
          {mode === "register" && (
            <label>
              Nom affiché
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
          {mode === "register" && <label className="legal-consent"><input type="checkbox" aria-label="Accepter les conditions générales et la politique de confidentialité" {...register("acceptLegal")} /> <span>J’accepte les conditions générales et la politique de confidentialité de Mata Beauty.</span></label>}
          {feedback && <p className="auth-feedback" role="status">{feedback}</p>}
          <button className="primary-button full" type="submit" disabled={isSubmitting || !configuration.configured}>
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
