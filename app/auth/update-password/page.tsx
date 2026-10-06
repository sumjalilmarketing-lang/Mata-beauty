"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { authErrorMessage } from "@/lib/auth/errors";
import { readPasswordReturn, restorePasswordSession } from "@/lib/auth/password-session";

const schema = z.object({
  password: z.string().min(8, "Utilisez au moins 8 caractères."),
  confirmation: z.string(),
}).refine((values) => values.password === values.confirmation, {
  path: ["confirmation"],
  message: "Les mots de passe ne correspondent pas.",
});

type Values = z.infer<typeof schema>;

export default function UpdatePasswordPage() {
  const [feedback, setFeedback] = useState("");
  const [complete, setComplete] = useState(false);
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [invitation, setInvitation] = useState(false);
  const initialization = useRef<Promise<void> | null>(null);
  const submitting = useRef(false);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Values>({
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    let active = true;
    if (!initialization.current) {
      const url = new URL(window.location.href);
      const result = readPasswordReturn(url);
      setInvitation(result.kind === "tokens" ? result.invitation : url.searchParams.get("mode") === "invite");
      // Remove credentials before initializing the PKCE client, which would
      // otherwise reject an invitation's implicit hash during initialization.
      url.hash = "";
      if (result.kind === "tokens") url.searchParams.set("mode", result.invitation ? "invite" : "recovery");
      for (const key of ["code", "error", "error_code", "error_description"]) url.searchParams.delete(key);
      window.history.replaceState(null, "", `${url.pathname}${url.search}`);
      const client = getSupabaseBrowserClient();
      initialization.current = client ? restorePasswordSession(client, result) : Promise.reject(new Error("Service indisponible"));
    }
    void initialization.current.then(() => {
      if (active) setReady(true);
    }).catch((error: unknown) => {
      if (active) setFeedback(authErrorMessage(error));
    }).finally(() => {
      if (active) setChecking(false);
    });
    return () => { active = false; };
  }, []);

  async function submit(values: Values) {
    if (!ready || complete || submitting.current) return;
    submitting.current = true;
    setFeedback("");
    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        setFeedback("Supabase n’est pas configuré.");
        return;
      }
      const { error } = await supabase.auth.updateUser({ password: values.password });
      if (error) {
        setFeedback(authErrorMessage(error));
        return;
      }
      const { error: signOutError } = await supabase.auth.signOut();
      setComplete(true);
      setFeedback(signOutError
        ? "Mot de passe mis à jour. La déconnexion n’a pas pu être confirmée ; fermez cette session avant de vous reconnecter."
        : "Mot de passe mis à jour. Reconnectez-vous avec votre nouveau mot de passe.");
    } catch (error: unknown) {
      setFeedback(authErrorMessage(error));
    } finally {
      submitting.current = false;
    }
  }

  return (
    <main className="auth-page">
      <section className="modal auth-modal">
        <p className="eyebrow">Sécurité du compte</p>
        <h1>{invitation ? "Créer votre mot de passe" : "Nouveau mot de passe"}</h1>
        {checking && <p role="status">Vérification du lien…</p>}
        <form onSubmit={(event) => void handleSubmit(submit)(event)}>
          <label>Nouveau mot de passe<input type="password" autoComplete="new-password" {...register("password")} /></label>
          {errors.password && <small className="field-error">{errors.password.message}</small>}
          <label>Confirmation<input type="password" autoComplete="new-password" {...register("confirmation")} /></label>
          {errors.confirmation && <small className="field-error">{errors.confirmation.message}</small>}
          {feedback && <p className="auth-feedback" role="status">{feedback}</p>}
          <button className="primary-button full" disabled={!ready || isSubmitting || complete}>{isSubmitting ? "Mise à jour…" : "Mettre à jour"}</button>
        </form>
        {!checking && !ready && <Link className="outline-button return-home" href="/?auth=reset">Demander un nouveau lien</Link>}
        {complete && <Link className="outline-button return-home" href="/?connexion=requise">Se connecter</Link>}
        <Link className="outline-button return-home" href="/">Retour à Mata Beauty</Link>
      </section>
    </main>
  );
}
