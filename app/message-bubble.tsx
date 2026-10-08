import type { ReactNode } from "react";

/** Explicit foreground/background pairs keep messages readable in every workspace. */
export function MessageBubble({ body, createdAt, own, label }: {
  body: string;
  createdAt: string;
  own: boolean;
  label?: ReactNode;
}) {
  return <div className={`message-bubble${own ? " own" : ""}`}>
    {label && <strong className="message-author">{label}</strong>}
    <p>{body}</p>
    <time dateTime={createdAt}>{new Intl.DateTimeFormat("fr-SN", {
      dateStyle: "short", timeStyle: "short", timeZone: "Africa/Dakar",
    }).format(new Date(createdAt))}</time>
  </div>;
}
