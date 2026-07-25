"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { getSupabaseBrowserClient, getSupabaseConfiguration } from "@/lib/supabase/client";

const authSchema = z.object({
  displayName: z.string().trim().max(80).optional(),
  email: z.email("Adresse e-mail invalide."),
  password: z.string().min(8, "Le mot de passe doit contenir au moins 8 caractères."),
});

type AuthValues = z.infer<typeof authSchema>;
type AuthMode = "login" | "register" | "reset";
export type AuthenticatedProfile = {
  userId: string;
  role: "client" | "provider" | "admin";
};

export function AuthModal({
  initialMode = "login",
  intendedRole = "client",
  onClose,
  onAuthenticated,
  onDemo,
}: {
  initialMode?: AuthMode;
  intendedRole?: "client" | "provider";
  onClose: () => void;
  onAuthenticated: (profile: AuthenticatedProfile) => void;
  onDemo: () => void;
}) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [feedback, setFeedback] = useState("");
  const configuration = getSupabaseConfiguration();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AuthValues>({
    resolver: zodResolver(authSchema),
    defaultValues: { displayName: "", email: "", password: "" },
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
        const { data, error } = await supabase.auth.signUp({
          email: values.email,
          password: values.password,
          options: {
            data: {
              role: intendedRole,
              display_name: values.displayName?.trim() || values.email.split("@")[0],
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

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role,is_suspended")
        .eq("id", user.id)
        .single();
      if (profileError) throw profileError;
      if (profile.is_suspended) {
        await supabase.auth.signOut();
        throw new Error("Ce compte est suspendu. Contactez l’assistance Mata Beauty.");
      }
      onAuthenticated({ userId: user.id, role: profile.role });
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "L’opération a échoué. Réessayez.");
    }
  }

  const title = mode === "login" ? "Bienvenue" : mode === "register" ? "Créer votre compte" : "Mot de passe oublié";

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button className="modal-close" onClick={onClose} aria-label="Fermer">×</button>
        <p className="eyebrow">Compte sécurisé</p>
        <h2 id="auth-title">{title}</h2>
        {!configuration.configured && (
          <div className="configuration-warning" role="alert">
            Le mode réel attend la clé publique Supabase. Vous pouvez consulter uniquement l’aperçu de démonstration.
          </div>
        )}
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
        {!configuration.configured && (
          <button className="outline-button demo-entry" onClick={onDemo}>Voir l’aperçu clairement identifié</button>
        )}
      </section>
    </div>
  );
}
