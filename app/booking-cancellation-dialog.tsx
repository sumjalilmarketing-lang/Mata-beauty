"use client";

import { useEffect, useRef, useState } from "react";
import "./booking-cancellation-dialog.css";

export function BookingCancellationDialog({ serviceName, providerName, onDismiss, onConfirm }: {
  serviceName: string;
  providerName: string;
  onDismiss: () => void;
  onConfirm: () => Promise<boolean>;
}) {
  return <ActionConfirmationDialog title="Annuler ce rendez-vous ?"
    description={`Vous allez annuler « ${serviceName} » chez ${providerName}. Le professionnel sera informé et le créneau sera libéré.`}
    dismissLabel="Conserver le rendez-vous" confirmLabel="Confirmer l’annulation" busyLabel="Annulation…"
    failureMessage="L’annulation n’a pas été confirmée. Actualisez vos rendez-vous ou réessayez."
    onDismiss={onDismiss} onConfirm={onConfirm} />;
}

export function ActionConfirmationDialog({ title, description, dismissLabel, confirmLabel, busyLabel, failureMessage, onDismiss, onConfirm }: {
  title: string; description: string; dismissLabel: string; confirmLabel: string;
  busyLabel: string; failureMessage: string;
  onDismiss: () => void; onConfirm: () => Promise<boolean>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const keepButton = useRef<HTMLButtonElement>(null);
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    keepButton.current?.focus();
    return () => element?.close();
  }, []);

  async function confirm() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      if (!await onConfirm()) setError(failureMessage);
    } catch {
      setError(failureMessage);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return <dialog ref={dialog} className="booking-cancellation-dialog" aria-labelledby="booking-cancel-title" aria-describedby="booking-cancel-description" onCancel={event => { event.preventDefault(); if (!inFlight.current) onDismiss(); }}>
    <h2 id="booking-cancel-title">{title}</h2>
    <p id="booking-cancel-description">{description}</p>
    {error && <p role="alert">{error}</p>}
    <div className="booking-cancellation-actions">
      <button ref={keepButton} type="button" disabled={busy} onClick={onDismiss}>{dismissLabel}</button>
      <button className="booking-cancellation-confirm" type="button" disabled={busy} onClick={() => void confirm()}>{busy ? busyLabel : confirmLabel}</button>
    </div>
  </dialog>;
}
