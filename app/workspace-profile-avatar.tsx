"use client";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ProfileStoryRing } from "./profile-story-ring";
import {useEffect,useState} from "react";
import {getSupabaseBrowserClient} from "@/lib/supabase/client";
export function WorkspaceProfileAvatar({href,email}:{href:string;email:string}) {
 const [photo,setPhoto]=useState<string|null>(null);
 const [userId,setUserId]=useState<string|null>(null);
 const router=useRouter();
 useEffect(()=>{
  const client=getSupabaseBrowserClient();let active=true;
  async function refresh(){if(!client)return;const {data:{user}}=await client.auth.getUser();if(!user)return;if(active)setUserId(user.id);const result=await client.from("profiles").select("avatar_url").eq("id",user.id).abortSignal(AbortSignal.timeout(10000)).maybeSingle();if(active&&!result.error)setPhoto(result.data?.avatar_url??null);}
  const update=()=>{void refresh().catch(()=>undefined);};update();window.addEventListener("focus",update);window.addEventListener("mata-profile-updated",update);
  return()=>{active=false;window.removeEventListener("focus",update);window.removeEventListener("mata-profile-updated",update);};
 },[]);
 return userId ? <ProfileStoryRing providerId={userId} name="Mon profil" className="workspace-account" onOpenProfile={()=>router.push(href)}>{photo?<Image unoptimized src={photo} alt="Ma photo de profil" width={44} height={44} style={{width:"100%",height:"100%",objectFit:"cover",borderRadius:"50%"}} onError={()=>setPhoto(null)}/>:email.slice(0,1).toUpperCase()}</ProfileStoryRing> : <button type="button" className="workspace-account" aria-label="Mon profil et mes paramètres" onClick={()=>router.push(href)}>{photo?<Image unoptimized src={photo} alt="Ma photo de profil" width={44} height={44} style={{width:"100%",height:"100%",objectFit:"cover",borderRadius:"50%"}} onError={()=>setPhoto(null)}/>:email.slice(0,1).toUpperCase()}</button>;
}
