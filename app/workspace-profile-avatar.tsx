"use client";
import Image from "next/image";
import Link from "next/link";
import {useEffect,useState} from "react";
import {getSupabaseBrowserClient} from "@/lib/supabase/client";
export function WorkspaceProfileAvatar({href,email}:{href:string;email:string}) {
 const [photo,setPhoto]=useState<string|null>(null);
 useEffect(()=>{
  const client=getSupabaseBrowserClient();let active=true;
  async function refresh(){if(!client)return;const {data:{user}}=await client.auth.getUser();if(!user)return;const result=await client.from("profiles").select("avatar_url").eq("id",user.id).abortSignal(AbortSignal.timeout(10000)).maybeSingle();if(active&&!result.error)setPhoto(result.data?.avatar_url??null);}
  const update=()=>{void refresh().catch(()=>undefined);};update();window.addEventListener("focus",update);window.addEventListener("mata-profile-updated",update);
  return()=>{active=false;window.removeEventListener("focus",update);window.removeEventListener("mata-profile-updated",update);};
 },[]);
 return <Link href={href} className="workspace-account" aria-label="Mon profil et mes paramètres" title={email}>{photo?<Image unoptimized src={photo} alt="Ma photo de profil" width={44} height={44} style={{width:"100%",height:"100%",objectFit:"cover",borderRadius:"50%"}} onError={()=>setPhoto(null)}/>:email.slice(0,1).toUpperCase()}</Link>;
}
