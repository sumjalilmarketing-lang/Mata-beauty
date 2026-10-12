import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { publicProfessionalName } from "@/lib/domain/feed-presentation";
import { createClient } from "@supabase/supabase-js";

type SharedPost = {
  id: string; author_id: string; caption: string; video_url: string; thumbnail_url: string | null;
  business_name: string; slug: string; provider_service_id: string; service_title: string; duration_minutes: number;
  price_amount: number; city: string;
};

async function getPost(id: string): Promise<SharedPost | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const client = createClient(url, key, { auth: { persistSession: false } });
  const { data } = await client.from("social_feed").select("id,author_id,caption,video_url,thumbnail_url,business_name,slug,provider_service_id,service_title,duration_minutes,price_amount,city").eq("id", id).maybeSingle();
  return data as SharedPost | null;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const post = await getPost((await params).id);
  if (!post) return { title: "Vidéo introuvable" };
  const title = `${post.service_title} par ${publicProfessionalName(post.business_name)}`;
  return {
    title,
    description: post.caption,
    openGraph: { title, description: post.caption, type: "video.other", images: post.thumbnail_url ? [{ url: post.thumbnail_url }] : [] },
    twitter: { card: "summary_large_image", title, description: post.caption, images: post.thumbnail_url ? [post.thumbnail_url] : [] },
  };
}

export default async function SharedPostPage({ params }: { params: Promise<{ id: string }> }) {
  const post = await getPost((await params).id);
  if (!post) return <main className="shared-post-page"><h1>Cette vidéo n’est plus disponible.</h1><Link href="/">Retour au feed</Link></main>;
  redirect("/professional/" + encodeURIComponent(post.slug) + "?video=" + post.id);
}
