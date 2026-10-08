"use client";

import { useCallback, useRef, useState, type ComponentPropsWithRef } from "react";
import { passwordPolicyMessage } from "@/lib/auth/password-policy";

export function PasswordField({ ref, ...props }: Omit<ComponentPropsWithRef<"input">, "type">) {
  const [visible, setVisible] = useState(false);
  const input = useRef<HTMLInputElement | null>(null);
  const attach = useCallback((node: HTMLInputElement | null) => {
    input.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) ref.current = node;
  }, [ref]);
  function toggle() {
    const node = input.current;
    const focused = node === document.activeElement;
    const start = node?.selectionStart, end = node?.selectionEnd;
    setVisible(value => !value);
    requestAnimationFrame(() => {
      if (focused && node && start != null && end != null) node.setSelectionRange(start, end);
    });
  }
  return <span className="password-field">
    <input {...props} ref={attach} type={visible ? "text" : "password"} />
    <button type="button" className="password-toggle" aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"} aria-pressed={visible} disabled={props.disabled}
      onPointerDown={event => event.preventDefault()} onClick={toggle}>
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" />{!visible && <path d="m3 3 18 18" />}</svg>
    </button>
  </span>;
}

export function PasswordRequirements({ password = "", confirmation = "" }: { password?: string; confirmation?: string }) {
  const criteria = [["12 caractères minimum", password.length >= 12], ["Une minuscule", /[a-z]/.test(password)], ["Une majuscule", /[A-Z]/.test(password)], ["Un chiffre", /[0-9]/.test(password)], ["Un symbole", /[\x21-\x2f\x3a-\x40\x5b-\x60\x7b-\x7e]/.test(password)]] as const;
  return <div className="password-requirements"><p>{passwordPolicyMessage}</p><ul>{criteria.map(([label, met]) => <li key={label}>{met ? "✓" : "○"} {label}</li>)}</ul>
    {confirmation && <p role="status" className={password === confirmation ? "password-match" : "field-error"}>{password === confirmation ? "Les mots de passe correspondent." : "Les mots de passe ne correspondent pas."}</p>}
  </div>;
}
