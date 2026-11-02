"use client";
import { useEffect, useRef, useState } from "react";
import { cropRectangle } from "@/lib/domain/media-composer";

export function PhotoCropper({ file, onApply, onCancel }: { file: File; onApply: (file: File) => void; onCancel: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const source = useRef<HTMLImageElement | null>(null);
  const [ratio, setRatio] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [x, setX] = useState(.5);
  const [y, setY] = useState(.5);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const url = URL.createObjectURL(file); const image = new window.Image(); let active = true;
    image.onload = () => { if (active) { source.current = image; setLoaded(true); } };
    image.onerror = () => { if (active) setError("Cette photo ne peut pas être recadrée. Choisissez une image JPEG, PNG ou WebP."); };
    image.src = url;
    return () => { active = false; source.current = null; URL.revokeObjectURL(url); };
  }, [file]);
  useEffect(() => {
    const image = source.current, target = canvas.current;
    if (!loaded || !image || !target) return;
    const rect = cropRectangle(image.naturalWidth, image.naturalHeight, ratio, zoom, x, y);
    target.width = Math.round(Math.min(1600, rect.width)); target.height = Math.max(1, Math.round(target.width / ratio));
    target.getContext("2d")?.drawImage(image, rect.x, rect.y, rect.width, rect.height, 0, 0, target.width, target.height);
  }, [loaded, ratio, zoom, x, y]);
  function apply() {
    if (!canvas.current || !loaded || busy) return; setBusy(true);
    canvas.current.toBlob(blob => { if (!blob) { setError("Recadrage impossible. Réessayez."); setBusy(false); return; } onApply(new File([blob], file.name.replace(/\.[^.]+$/, "") + "-recadre.png", { type: "image/png" })); }, "image/png");
  }
  return <section className="photo-cropper" aria-label="Recadrer la photo"><h3>Recadrer la photo</h3><canvas ref={canvas} aria-label="Aperçu du recadrage" /><label>Format<select value={ratio} disabled={busy} onChange={e => setRatio(Number(e.target.value))}><option value={1}>Carré · 1:1</option><option value={9 / 16}>Portrait · 9:16</option><option value={4 / 5}>Portrait · 4:5</option><option value={16 / 9}>Paysage · 16:9</option></select></label><label>Zoom<input type="range" min={1} max={3} step={.01} value={zoom} disabled={busy} onChange={e => setZoom(Number(e.target.value))} /></label><label>Position horizontale<input type="range" min={0} max={1} step={.01} value={x} disabled={busy} onChange={e => setX(Number(e.target.value))} /></label><label>Position verticale<input type="range" min={0} max={1} step={.01} value={y} disabled={busy} onChange={e => setY(Number(e.target.value))} /></label>{error && <p role="alert">{error}</p>}<div className="composer-actions"><button type="button" disabled={!loaded || busy} onClick={apply}>{busy ? "Recadrage…" : "Appliquer le recadrage"}</button><button type="button" disabled={busy} onClick={onCancel}>Annuler</button></div></section>;
}
