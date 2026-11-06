"use client";
import { useState } from "react";

export function ServiceDurationInput({ name, defaultValue, disabled = false }: { name: string; defaultValue?: number; disabled?: boolean }) {
  const [hours, setHours] = useState(defaultValue === undefined ? "" : String(Math.floor(defaultValue / 60)));
  const [minutes, setMinutes] = useState(defaultValue === undefined ? "" : String(defaultValue % 60));
  const total = Number(hours) * 60 + Number(minutes);
  return <fieldset disabled={disabled} style={{ minWidth: 0, border: 0, padding: 0, margin: 0 }}>
    <legend>Durée de la prestation</legend>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      <label>Heures<input type="number" inputMode="numeric" min={0} max={12} step={1} required value={hours} onChange={event => setHours(event.target.value)} /></label>
      <label>Minutes<input type="number" inputMode="numeric" min={0} max={59} step={1} required value={minutes} onChange={event => setMinutes(event.target.value)} ref={element => { element?.setCustomValidity(total < 15 || total > 720 ? "Choisissez une durée entre 15 minutes et 12 heures." : ""); }} /></label>
    </div>
    <input type="hidden" name={name} value={total} />
    <small>De 15 minutes à 12 heures. Exemple : 2 heures et 15 minutes.</small>
  </fieldset>;
}
