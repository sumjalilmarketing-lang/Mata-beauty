"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import type { CategoryMedia } from "@/lib/catalog/category-media";

// One page-wide clock: at most one visible card starts a transition per tick.
const cards = new Map<symbol, () => void>();
let clock: ReturnType<typeof setInterval> | undefined;
let cursor = 0;
function registerCard(key: symbol, advance: () => void) {
  cards.set(key, advance);
  clock ??= setInterval(() => {
    if (document.hidden || !cards.size) return;
    const visible = [...cards.values()];
    visible[cursor++ % visible.length]?.();
  }, 2200);
  return () => { cards.delete(key); if (!cards.size) { clearInterval(clock); clock = undefined; cursor = 0; } };
}

export function CategoryCarousel({ name, icon, media, paused, onOpen }: { name: string; icon: string | null; media: CategoryMedia[]; paused: boolean; onOpen: () => void }) {
  const button = useRef<HTMLButtonElement>(null);
  const identity = useRef(Symbol());
  const [visible, setVisible] = useState(false);
  const [seen, setSeen] = useState(false);
  const [reduced, setReduced] = useState(true);
  const [interacting, setInteracting] = useState(false);
  const [current, setCurrent] = useState(0);
  const [pending, setPending] = useState<number | null>(null);
  const [fading, setFading] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const failed = useRef(new Set<string>());
  const lastChange = useRef(0);
  const gesture = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef(false);
  const active = media[current] ?? media[0];

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update(); query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      const inView = entries[0]?.isIntersecting ?? false;
      setVisible(inView);
      if (inView) setSeen(true);
    }, { threshold: .35 });
    if (button.current) observer.observe(button.current);
    return () => observer.disconnect();
  }, []);
  const advance = useCallback((direction = 1, manual = false) => {
    if (pending !== null || media.length < 2 || (!manual && Date.now() - lastChange.current < 8000)) return;
    for (let step = 1; step < media.length; step++) {
      const next = (current + direction * step + media.length) % media.length;
      if (!failed.current.has(media[next].src)) { setPending(next); lastChange.current = Date.now(); break; }
    }
  }, [current, media, pending]);
  const advanceRef = useRef(advance);
  useEffect(() => { advanceRef.current = advance; }, [advance]);
  useEffect(() => {
    if (!visible || reduced || paused || interacting || media.length < 2) return;
    if (!lastChange.current) lastChange.current = Date.now();
    return registerCard(identity.current, () => advanceRef.current());
  }, [interacting, media.length, paused, reduced, visible]);
  useEffect(() => {
    if (pending === null) return;
    const timeout = setTimeout(() => { setPending(null); setFading(false); }, 10000);
    return () => clearTimeout(timeout);
  }, [pending]);
  useEffect(() => {
    if (!fading || pending === null) return;
    const timer = setTimeout(() => { setCurrent(pending); setPending(null); setFading(false); setImageFailed(false); }, reduced ? 0 : 750);
    return () => clearTimeout(timer);
  }, [fading, pending, reduced]);

  return <button ref={button} className="category-carousel" aria-label={`Explorer ${name}`} data-category={active?.categorySlug} data-current-media={active?.src} data-media-origin={active?.origin}
    onMouseEnter={() => setInteracting(true)} onMouseLeave={() => setInteracting(false)} onFocus={() => setInteracting(true)} onBlur={() => setInteracting(false)}
    onClick={() => { if (suppressClick.current) { suppressClick.current = false; return; } onOpen(); }}
    onKeyDown={event => { if (event.key === "ArrowRight" || event.key === "ArrowLeft") { event.preventDefault(); advance(event.key === "ArrowRight" ? 1 : -1, true); } }}
    onPointerDown={event => { suppressClick.current = false; gesture.current = { x: event.clientX, y: event.clientY }; }}
    onPointerCancel={() => { gesture.current = null; }}
    onPointerUp={event => {
      const start = gesture.current; gesture.current = null; if (!start) return;
      const dx = event.clientX - start.x, dy = event.clientY - start.y;
      if (Math.abs(dx) > 35 && Math.abs(dx) > Math.abs(dy) * 1.4) {
        suppressClick.current = true; advance(dx < 0 ? 1 : -1, true);
      } else if (event.pointerType === "touch" && Math.abs(dx) < 10 && Math.abs(dy) < 10) {
        // Touch browsers need not synthesize a click after a carousel gesture.
        event.preventDefault(); suppressClick.current = true; onOpen();
      }
    }}>
    <span className="category-placeholder" aria-hidden="true">{icon && !icon.includes("/") ? icon : "◇"}</span>
    {active && <Image unoptimized className="category-photo" src={active.src} alt={active.alt} width={640} height={640} loading={seen ? "eager" : "lazy"} decoding="async" draggable={false} style={{ opacity: imageFailed ? 0 : 1 }}
      onLoad={() => setImageFailed(false)} onError={() => { failed.current.add(active.src); setImageFailed(true); advance(1, true); }} />}
    {pending !== null && media[pending] && <Image unoptimized loading="eager" key={media[pending].src} className={`category-photo category-photo-next${fading ? " is-visible" : ""}`} src={media[pending].src} alt="" aria-hidden="true" width={640} height={640} decoding="async" draggable={false}
      onLoad={() => { requestAnimationFrame(() => setFading(true)); }} onError={() => { failed.current.add(media[pending].src); setPending(null); setFading(false); }} />}
    <strong>{name}</strong>
    {media.length > 1 && <span className="category-dots" aria-hidden="true">{media.map((item, index) => <i key={item.src} className={index === current ? "active" : ""} />)}</span>}
  </button>;
}
