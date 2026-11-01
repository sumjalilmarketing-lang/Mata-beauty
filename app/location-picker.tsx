"use client";
import { applicationText } from "@/lib/domain/application-copy";
import { useApplicationLocale } from "./use-application-locale";

import { useEffect, useRef, useState } from "react";
import type { Coordinates } from "@/lib/domain/location";

export function LocationPicker({ area, position, suggestions, onChange, autoLocate = false, radiusKm, onRadiusChange }: {
  area: string; position: Coordinates | null; suggestions: string[];
  onChange: (area: string, position: Coordinates | null) => void; autoLocate?: boolean;
  radiusKm?: 2 | 5 | 10 | 20; onRadiusChange?: (radius: 2 | 5 | 10 | 20) => void;
}) {
  const locale = useApplicationLocale();
  const t = (text: string) => applicationText(text, locale);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const request = useRef(0);
  const autoRequested = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function cancel() { request.current += 1; if (timer.current) clearTimeout(timer.current); }
  function locate() {
    cancel();
    if (!navigator.geolocation) { setMessage(t("Ce navigateur ne propose pas la localisation. Choisissez une ville ou un quartier.")); return; }
    const current = request.current;
    setPending(true); setMessage("");
    const fail = (text: string) => { if (current !== request.current) return; cancel(); setPending(false); setMessage(text); };
    timer.current = setTimeout(() => fail(t("La localisation prend trop de temps. Choisissez une zone ou réessayez.")), 10_000);
    navigator.geolocation.getCurrentPosition((result) => {
      if (current !== request.current) return;
      cancel(); setPending(false);
      if (result.coords.accuracy > 5000) { setMessage(t("Votre position est trop imprécise. Choisissez une ville ou un quartier.")); return; }
      onChange("", { latitude: result.coords.latitude, longitude: result.coords.longitude });
      setMessage(`Résultats dans un rayon de ${radiusKm ?? 5} km, selon les adresses géolocalisées des établissements.`);
    }, (error) => fail(error.code === 1 ? t("Localisation refusée. Vous pouvez choisir une ville ou un quartier.") : t("Position indisponible. Choisissez une zone ou réessayez.")), { timeout: 9000, maximumAge: 60_000, enableHighAccuracy: false });
  }

  useEffect(() => () => { request.current += 1; if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => {
    const start = setTimeout(() => {
      if (autoLocate && !autoRequested.current && !area && !position) { autoRequested.current = true; locate(); }
    }, 0);
    return () => clearTimeout(start);
    // The initial opt-in comes from clicking Près de moi; later edits must not reopen permission.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLocate]);

  return <section className="location-picker" aria-label={t("Choisir votre localisation")}>
    <div><strong>{position ? `Près de vous · ${radiusKm ?? 25} km` : area || t("Choisir une zone")}</strong><button type="button" disabled={pending} onClick={locate}>{pending ? t("Localisation…") : t("Utiliser ma position")}</button></div>
    {onRadiusChange && <label>{t("Rayon de recherche")}<select aria-label={t("Rayon de recherche")} value={radiusKm ?? 5} onChange={(event) => { const value = Number(event.target.value); if (value === 2 || value === 5 || value === 10 || value === 20) onRadiusChange(value); }}>{[2, 5, 10, 20].map((value) => <option key={value} value={value}>{value} km</option>)}</select></label>}
    <label>{t("Zone géographique")}<input aria-label={t("Ville, quartier ou pays")} maxLength={120} list="mata-location-suggestions" placeholder={t("Pays, ville ou quartier")} value={area} onChange={(event) => { cancel(); setPending(false); setMessage(""); onChange(event.target.value, null); }} /></label>
    <datalist id="mata-location-suggestions">{suggestions.map((value) => <option key={value} value={value} />)}</datalist>
    {(area || position) && <button type="button" onClick={() => { cancel(); setPending(false); setMessage(""); onChange("", null); }}>{t("Effacer la localisation")}</button>}
    {message && <p role="status">{message}</p>}
  </section>;
}
