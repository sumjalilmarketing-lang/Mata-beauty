"use client";
import {useSyncExternalStore} from 'react';
import {getSupabaseBrowserClient} from '@/lib/supabase/client';
import './unread-inbox.css';
type Counts={messages:number;notifications:number;bookings:number};
const empty:Counts={messages:0,notifications:0,bookings:0};
let counts=empty,stop:(()=>void)|null=null;
const listeners=new Set<()=>void>();
function publish(next:Counts){if(counts.messages===next.messages&&counts.notifications===next.notifications&&counts.bookings===next.bookings)return;counts=next;listeners.forEach(listener=>listener());}
function start(){
 const client=getSupabaseBrowserClient();if(!client)return ()=>{};
 let active=true,version=0,owner='';
 let channel:ReturnType<typeof client.channel>|null=null;
 async function refresh(){
  const run=++version;
  let user;try{user=await client!.auth.getUser();}catch{return;}
  if(!active||run!==version)return;
  const id=user.data.user?.id??'';
  if(owner!==id){owner=id;publish(empty);if(channel)void client!.removeChannel(channel);channel=null;
   if(id)channel=client!.channel('inbox-counts-'+id)
    .on('postgres_changes',{event:'*',schema:'public',table:'messages'},()=>void refresh())
    .on('postgres_changes',{event:'*',schema:'public',table:'bookings'},()=>void refresh())
    .on('postgres_changes',{event:'*',schema:'public',table:'conversation_members',filter:'profile_id=eq.'+id},()=>void refresh())
    .on('postgres_changes',{event:'*',schema:'public',table:'notifications',filter:'profile_id=eq.'+id},()=>void refresh()).subscribe();
  }
  if(!id){publish(empty);return;}
  try{const result=await client!.rpc('my_unread_inbox_counts').abortSignal(AbortSignal.timeout(12000));
   if(active&&run===version&&!result.error){const data=result.data as Partial<Counts>|null;
    publish({messages:Math.max(0,Number(data?.messages)||0),notifications:Math.max(0,Number(data?.notifications)||0),bookings:Math.max(0,Number(data?.bookings)||0)});}
  }catch{/* Keep the last confirmed count until connectivity returns. */}
 }
 const trigger=()=>{void refresh();};
 const auth=client.auth.onAuthStateChange(()=>{version++;publish(empty);setTimeout(trigger,0);});
 const events=['focus','online','mata-conversations-read','mata-notifications-changed'];events.forEach(event=>window.addEventListener(event,trigger));
 const timer=setInterval(trigger,15000);trigger();
 return ()=>{active=false;version++;clearInterval(timer);auth.data.subscription.unsubscribe();events.forEach(event=>window.removeEventListener(event,trigger));if(channel)void client.removeChannel(channel);publish(empty);};
}
function subscribe(listener:()=>void){listeners.add(listener);if(listeners.size===1)stop=start();return ()=>{listeners.delete(listener);if(!listeners.size){stop?.();stop=null;}};}
export function UnreadBadge({kind}:{kind:keyof Counts}){
 const value=useSyncExternalStore(subscribe,()=>counts,()=>empty)[kind];
 return value>0?<span className="inbox-count" aria-label={`${value} ${kind==='messages'?'messages non lus':kind==='bookings'?'rendez-vous avec des nouveautés':'notifications non lues'}`}>{value>99?'99+':value}</span>:null;
}
export function MenuUnreadBadge({moduleKey}:{moduleKey:string}){return moduleKey==='messages'?<UnreadBadge kind="messages"/>:moduleKey==='notifications'?<UnreadBadge kind="notifications"/>:moduleKey==='bookings'?<UnreadBadge kind="bookings"/>:null;}
