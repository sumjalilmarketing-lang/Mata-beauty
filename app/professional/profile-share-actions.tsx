"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function ProfileShareActions({ profileUrl, businessName }: { profileUrl: string; businessName: string }) {
  const [qrCode, setQrCode] = useState("");
  const message = `Découvrez le profil Mata Beauty de ${businessName}`;
  useEffect(() => { let active = true; void QRCode.toDataURL(profileUrl, { width: 420, margin: 2, color: { dark: "#2b0c20", light: "#fffaf7" } }).then((url) => { if (active) setQrCode(url); }); return () => { active = false; }; }, [profileUrl]);
  async function share() { if (navigator.share) await navigator.share({ title: businessName, text: message, url: profileUrl }); else await navigator.clipboard.writeText(profileUrl); }
  return <aside className="profile-share-actions"><div><span>PARTAGER MON PROFIL</span><h2>Votre vitrine Mata Beauty</h2><p>QR Code pour le salon, Instagram, WhatsApp ou une carte de visite.</p><div><button onClick={() => void share()}>Partager</button><a href={`https://wa.me/?text=${encodeURIComponent(`${message} — ${profileUrl}`)}`} target="_blank" rel="noreferrer">WhatsApp</a></div></div>{qrCode && <a href={qrCode} download={`mata-beauty-${businessName.toLowerCase().replaceAll(/[^a-z0-9]+/g,"-")}.png`}><Image src={qrCode} alt={`QR Code du profil ${businessName}`} width={180} height={180} unoptimized/><small>Télécharger le QR</small></a>}</aside>;
}
