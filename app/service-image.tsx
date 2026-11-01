"use client";
import Image from "next/image";
import { useState } from "react";
import { editorialCategoryMedia } from "@/lib/catalog/category-media";

export function ServiceImage({ src, category, alt, sizes, priority = false, caption = false }: { src?: string; category: string; alt: string; sizes: string; priority?: boolean; caption?: boolean }) {
  const [failed, setFailed] = useState<string[]>([]);
  const candidates = [src, ...editorialCategoryMedia(category).map(item => item.src)].filter((value): value is string => Boolean(value));
  const current = candidates.find(value => !failed.includes(value));
  const editorial = current?.startsWith("/images/categories/");
  return current ? <><Image src={current} alt={editorial ? `${category} — illustration éditoriale` : alt} fill sizes={sizes} priority={priority} unoptimized onError={() => setFailed(previous => [...previous, current])} />{editorial && caption && <small className="service-image-caption">Illustration</small>}</> : <span className="service-image-unavailable" aria-label={`Illustration indisponible : ${category}`}>◇</span>;
}
