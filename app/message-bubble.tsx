"use client";

import { useEffect, useState, type ReactNode } from "react";

/** Explicit foreground/background pairs keep messages readable in every workspace. */
export function MessageBubble({ body, createdAt, own, label }: {
  body: string;
  createdAt: string;
  own: boolean;
  label?: ReactNode;
}) {
  const [timeZone, setTimeZone] = useState("UTC");
  useEffect(() => {
    const timer = window.setTimeout(() => setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"), 0);
    return () => window.clearTimeout(timer);
  }, []);
  return <div className={`message-bubble${own ? " own" : ""}`}>
    {label && <strong className="message-author">{label}</strong>}
    <p>{body}</p>
    <time dateTime={createdAt}>{new Intl.DateTimeFormat("fr-FR", {
      dateStyle: "short", timeStyle: "short", timeZone,
    }).format(new Date(createdAt))}</time>
  </div>;
}
