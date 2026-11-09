"use client";

import { useEffect, useRef, type RefObject } from "react";

/** Keep keyboard focus in the active dialog while allowing nested sign-in. */
export function useDialogFocus(element: RefObject<HTMLElement | null>, onClose: () => void, closeDisabled = false) {
  const close = useRef(onClose);
  const disabled = useRef(closeDisabled);
  useEffect(() => { close.current = onClose; disabled.current = closeDisabled; }, [onClose, closeDisabled]);

  useEffect(() => {
    const dialog = element.current;
    if (!dialog) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = () => [...dialog.querySelectorAll<HTMLElement>(
      'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
    )].filter(item => item.tabIndex >= 0 && item.getClientRects().length > 0 && !item.closest("[inert]"));
    (focusable()[0] ?? dialog).focus();

    const keydown = (event: KeyboardEvent) => {
      const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
      if (dialogs[dialogs.length - 1] !== dialog) return;
      if (event.key === "Escape") {
        event.preventDefault();
        if (!disabled.current) close.current();
      }
      if (event.key !== "Tab") return;
      const elements = focusable();
      const first = elements[0], last = elements.at(-1);
      if (!first || !last) { event.preventDefault(); dialog.focus(); return; }
      if (!dialog.contains(document.activeElement) || (event.shiftKey && document.activeElement === first)) {
        event.preventDefault(); (event.shiftKey ? last : first).focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      if (previous?.isConnected && (dialog.contains(document.activeElement) || document.activeElement === document.body)) previous.focus();
    };
  }, [element]);
}
