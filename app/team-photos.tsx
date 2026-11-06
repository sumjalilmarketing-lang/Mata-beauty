"use client";
import Image from "next/image";
import {useEffect,useState} from "react";
import {getSupabaseBrowserClient} from "@/lib/supabase/client";
export function useTeamPhotos(businessIds:string[]) {
 const key=[...new Set(businessIds)].sort().join(",");
 const [photos,setPhotos]=useState<Record<string,string|null>>({});
 useEffect(()=>{let active=true;const client=getSupabaseBrowserClient();
 async function refresh(){if(!client||!key)return;const results=await Promise.all(key.split(",").map(id=>client!.rpc("get_collaborator_team_photos",{target_business_id:id}).abortSignal(AbortSignal.timeout(10000))));if(active&&results.every(result=>!result.error))setPhotos(Object.fromEntries(results.flatMap(result=>(result.data??[]) as {collaborator_id:string;avatar_url:string|null}[]).map(row=>[row.collaborator_id,row.avatar_url])));}
 const update=()=>{void refresh().catch(()=>undefined);};update();const timer=window.setInterval(update,30000);window.addEventListener("focus",update);window.addEventListener("mata-profile-updated",update);return()=>{active=false;window.clearInterval(timer);window.removeEventListener("focus",update);window.removeEventListener("mata-profile-updated",update);};},[key]);
 return photos;
}
export function TeamPhoto({name,url}:{name:string;url?:string|null}){const [failed,setFailed]=useState<string|null>(null);return url&&url!==failed?<Image unoptimized src={url} alt={`Photo de ${name}`} width={64} height={64} style={{borderRadius:"50%",objectFit:"cover",width:64,height:64}} onError={()=>setFailed(url)}/>:<span aria-label={`Photo non renseignée : ${name}`} style={{display:"inline-grid",placeItems:"center",width:64,height:64,borderRadius:"50%",background:"#751644",color:"white",fontWeight:700}}>{name.trim().slice(0,1).toUpperCase()}</span>;}
