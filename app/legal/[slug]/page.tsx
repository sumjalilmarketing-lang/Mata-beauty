import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { legalDocuments, legalTitle } from "@/lib/legal-documents";

export function generateStaticParams() { return legalDocuments.map(([slug]) => ({ slug })); }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> { const title=legalTitle((await params).slug); return { title:title ?? "Document juridique", robots: title ? { index:true,follow:true } : { index:false,follow:false } }; }
export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) { const title=legalTitle((await params).slug); if(!title)notFound(); return <main className="legal-page"><Link href="/">← Mata Beauty</Link><article><span>DOCUMENT EN PRÉPARATION</span><h1>{title}</h1><div role="note"><strong>Validation juridique requise</strong><p>Ce document n’est pas encore présenté comme une version juridiquement validée. Il sera publié ici après rédaction métier et validation par un conseil juridique compétent.</p></div><p>Pour toute question avant publication, contactez l’équipe Mata Beauty depuis la rubrique Support de votre espace.</p><Link href="/app/support">Accéder au support</Link></article></main>; }
