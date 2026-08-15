"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { authErrorMessage } from "@/lib/auth/errors";

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
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Values>({
    resolver: zodResolver(schema),
  });

  async function submit(values: Values) {
    setFeedback("");
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
    await supabase.auth.signOut();
    setComplete(true);
    setFeedback("Mot de passe mis à jour. Reconnectez-vous avec votre nouveau mot de passe.");
  }

  return (
    <main className="auth-page">
      <section className="modal auth-modal">
        <p className="eyebrow">Sécurité du compte</p>
        <h1>Nouveau mot de passe</h1>
        <form onSubmit={handleSubmit(submit)}>
          <label>Nouveau mot de passe<input type="password" autoComplete="new-password" {...register("password")} /></label>
          {errors.password && <small className="field-error">{errors.password.message}</small>}
          <label>Confirmation<input type="password" autoComplete="new-password" {...register("confirmation")} /></label>
          {errors.confirmation && <small className="field-error">{errors.confirmation.message}</small>}
          {feedback && <p className="auth-feedback" role="status">{feedback}</p>}
          <button className="primary-button full" disabled={isSubmitting || complete}>{isSubmitting ? "Mise à jour…" : "Mettre à jour"}</button>
        </form>
        <Link className="outline-button return-home" href="/">Retour à Mata Beauty</Link>
      </section>
    </main>
  );
}
