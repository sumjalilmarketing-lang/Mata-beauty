"use client";

import { useEffect, useRef, useState } from "react";
import type { Coordinates } from "@/lib/domain/location";

export function LocationPicker({ area, position, suggestions, onChange, autoLocate = false }: {
  area: string; position: Coordinates | null; suggestions: string[];
  onChange: (area: string, position: Coordinates | null) => void; autoLocate?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const request = useRef(0);
  const autoRequested = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function cancel() { request.current += 1; if (timer.current) clearTimeout(timer.current); }
  function locate() {
    cancel();
    if (!navigator.geolocation) { setMessage("Ce navigateur ne propose pas la localisation. Choisissez une ville ou un quartier."); return; }
    const current = request.current;
    setPending(true); setMessage("");
    const fail = (text: string) => { if (current !== request.current) return; cancel(); setPending(false); setMessage(text); };
    timer.current = setTimeout(() => fail("La localisation prend trop de temps. Choisissez une zone ou réessayez."), 10_000);
    navigator.geolocation.getCurrentPosition((result) => {
      if (current !== request.current) return;
      cancel(); setPending(false);
      if (result.coords.accuracy > 5000) { setMessage("Votre position est trop imprécise. Choisissez une ville ou un quartier."); return; }
      onChange("", { latitude: result.coords.latitude, longitude: result.coords.longitude });
      setMessage("Résultats dans un rayon de 25 km, selon les adresses géolocalisées des établissements.");
    }, (error) => fail(error.code === 1 ? "Localisation refusée. Vous pouvez choisir une ville ou un quartier." : "Position indisponible. Choisissez une zone ou réessayez."), { timeout: 9000, maximumAge: 60_000, enableHighAccuracy: false });
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

  return <section className="location-picker" aria-label="Choisir votre localisation">
    <div><strong>{position ? "Près de vous · 25 km" : area || "Choisir une zone"}</strong><button type="button" disabled={pending} onClick={locate}>{pending ? "Localisation…" : "Utiliser ma position"}</button></div>
    <label>Ville ou quartier<input aria-label="Ville ou quartier" maxLength={120} list="mata-location-suggestions" placeholder="Ville ou quartier" value={area} onChange={(event) => { cancel(); setPending(false); setMessage(""); onChange(event.target.value, null); }} /></label>
    <datalist id="mata-location-suggestions">{suggestions.map((value) => <option key={value} value={value} />)}</datalist>
    {(area || position) && <button type="button" onClick={() => { cancel(); setPending(false); setMessage(""); onChange("", null); }}>Effacer la localisation</button>}
    {message && <p role="status">{message}</p>}
  </section>;
}
