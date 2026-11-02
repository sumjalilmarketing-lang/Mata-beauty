"use client";

import { useState, useSyncExternalStore } from "react";
import { analyticsChoice, setAnalyticsChoice, subscribeAnalyticsChoice, type AnalyticsChoice } from "@/lib/analytics/consent";
import { useApplicationLocale } from "./use-application-locale";

const serverChoice = () => null;
const copy = {
  fr: ["Confidentialité", "Mesure facultative des vues et parcours", "Sans votre accord, aucun identifiant de session de mesure n’est créé et ces statistiques facultatives ne sont pas envoyées. La connexion et les réservations fonctionnent dans tous les cas.", "Refuser ou retirer", "Autoriser", "Autorisée", "Désactivée", "Choix conservé 180 jours sur ce navigateur. Modifiable ici à tout moment.", "Votre choix n’a pas pu être mémorisé. La mesure reste désactivée."],
  en: ["Privacy", "Optional view and journey measurement", "Without your permission, no measurement session identifier is created and these optional statistics are not sent. Sign-in and bookings work either way.", "Refuse or withdraw", "Allow", "Allowed", "Disabled", "Your choice is stored for 180 days in this browser. Change it here at any time.", "Your choice could not be saved. Measurement remains disabled."],
  es: ["Privacidad", "Medición opcional de vistas y recorridos", "Sin tu permiso no se crea un identificador de sesión de medición ni se envían estas estadísticas opcionales. El acceso y las reservas funcionan en todos los casos.", "Rechazar o retirar", "Permitir", "Permitida", "Desactivada", "Tu elección se guarda durante 180 días en este navegador. Puedes cambiarla aquí en cualquier momento.", "No se ha podido guardar tu elección. La medición sigue desactivada."],
} as const;

export function PrivacyChoice() {
  const locale = useApplicationLocale();
  const text = copy[locale.startsWith("en") ? "en" : locale.startsWith("es") ? "es" : "fr"];
  const choice = useSyncExternalStore(subscribeAnalyticsChoice, analyticsChoice, serverChoice);
  const [error, setError] = useState(false);
  function choose(value: AnalyticsChoice) { setError(!setAnalyticsChoice(value)); }
  return <details className="privacy-choice">
    <summary>{text[0]}</summary>
    <section aria-label={text[1]}>
      <h2>{text[1]}</h2><p>{text[2]}</p>
      <p role="status">{choice === "accepted" ? text[5] : text[6]}</p>
      <div><button type="button" onClick={() => choose("rejected")}>{text[3]}</button><button type="button" onClick={() => choose("accepted")}>{text[4]}</button></div>
      <small>{text[7]}</small>{error && <p role="alert">{text[8]}</p>}
    </section>
  </details>;
}
