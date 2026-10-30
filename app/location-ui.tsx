"use client";

import { useEffect, useRef, useState } from "react";
import type { AddressSuggestion, GeoPoint, ResolvedAddress } from "@/lib/maps";
import { googleDirectionsUrl, validGeoPoint } from "@/lib/maps";

type AddressAutocompleteProps = {
  defaultAddress?: string | null;
  defaultPlaceId?: string | null;
  defaultLatitude?: number | null;
  defaultLongitude?: number | null;
  defaultCity?: string | null;
  defaultArea?: string | null;
  addressName?: string;
  required?: boolean;
  label?: string;
  onResolved?: (address: ResolvedAddress | null) => void;
};

export function AddressAutocomplete({ defaultAddress, defaultPlaceId, defaultLatitude, defaultLongitude, defaultCity, defaultArea, addressName="address", required=true, label="Adresse", onResolved }: AddressAutocompleteProps) {
  const [query,setQuery]=useState(defaultAddress??"");
  const [resolved,setResolved]=useState<ResolvedAddress|null>(defaultLatitude!=null&&defaultLongitude!=null?{placeId:defaultPlaceId??"",formattedAddress:defaultAddress??"",latitude:defaultLatitude,longitude:defaultLongitude,city:defaultCity??"",area:defaultArea??""}:null);
  const [suggestions,setSuggestions]=useState<AddressSuggestion[]>([]);
  const [status,setStatus]=useState("");
  const [open,setOpen]=useState(false);
  const sessionToken=useRef(crypto.randomUUID());

  useEffect(()=>{if(query.trim().length<3||query===resolved?.formattedAddress)return; const controller=new AbortController();const timer=setTimeout(()=>{const languageCode=document.documentElement.lang||navigator.language||"fr";void fetch(`/api/maps/autocomplete?input=${encodeURIComponent(query)}&languageCode=${encodeURIComponent(languageCode)}&sessionToken=${sessionToken.current}`,{signal:controller.signal,cache:"no-store"}).then(async response=>{const payload=await response.json() as {suggestions?:AddressSuggestion[];error?:string};if(!response.ok)throw new Error(payload.error);setSuggestions(payload.suggestions??[]);setOpen(true);setStatus(payload.suggestions?.length?"":"Aucune adresse trouvée.");}).catch(error=>{if((error as Error).name!=="AbortError")setStatus("Recherche d’adresse indisponible.");});},300);return()=>{clearTimeout(timer);controller.abort();};},[query,resolved?.formattedAddress]);

  async function choose(suggestion:AddressSuggestion){setStatus("Validation de l’adresse…");setOpen(false);try{const languageCode=document.documentElement.lang||navigator.language||"fr";const response=await fetch(`/api/maps/place?placeId=${encodeURIComponent(suggestion.placeId)}&languageCode=${encodeURIComponent(languageCode)}&sessionToken=${sessionToken.current}`,{cache:"no-store"});const payload=await response.json() as ResolvedAddress&{error?:string};if(!response.ok)throw new Error(payload.error);setResolved(payload);setQuery(payload.formattedAddress);setSuggestions([]);setStatus(`Adresse localisée${payload.countryCode?` · ${new Intl.DisplayNames([languageCode],{type:"region"}).of(payload.countryCode)??payload.countryCode}`:""}. Vérifiez le pays avant de continuer.`);onResolved?.(payload);sessionToken.current=crypto.randomUUID();}catch{setResolved(null);setStatus("Cette adresse n’a pas pu être validée.");onResolved?.(null);}}
  function change(value:string){setQuery(value);if(value.trim().length<3)setSuggestions([]);if(value!==resolved?.formattedAddress){setResolved(null);onResolved?.(null);}}

  return <div className="address-autocomplete">
    <label>{label}<input name={addressName} value={query} onChange={event=>change(event.target.value)} onFocus={()=>setOpen(true)} autoComplete="off" required={required}/></label>
    <input type="hidden" name="placeId" value={resolved?.placeId??""}/><input type="hidden" name="latitude" value={resolved?.latitude??""}/><input type="hidden" name="longitude" value={resolved?.longitude??""}/><input type="hidden" name="resolvedCity" value={resolved?.city??defaultCity??""}/><input type="hidden" name="resolvedArea" value={resolved?.area??defaultArea??""}/>
    {open&&suggestions.length>0&&<div className="address-suggestions" role="listbox" aria-label="Suggestions d’adresse">{suggestions.map(item=><button type="button" role="option" aria-selected="false" key={item.placeId} onClick={()=>void choose(item)}><strong>{item.primaryText}</strong><small>{item.secondaryText}</small></button>)}</div>}
    {status&&<small className={resolved?"address-status valid":"address-status"} role="status">{status}</small>}
  </div>;
}

export function ProviderMap({name,address,latitude,longitude,origin}:{name:string;address?:string|null;latitude?:number|null;longitude?:number|null;origin?:GeoPoint|null}){
  if(latitude==null||longitude==null||!validGeoPoint({latitude,longitude}))return <div className="map-unavailable"><strong>Localisation non publiée</strong><p>Le professionnel communiquera l’adresse exacte pendant la réservation.</p></div>;
  const destination={latitude,longitude};const browserKey=process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY;const directions=googleDirectionsUrl(destination,origin??undefined);
  return <section className="provider-map" aria-label={`Carte de ${name}`}>
    {browserKey?<iframe title={`Localisation de ${name}`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" src={`https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(browserKey)}&q=${latitude},${longitude}&zoom=15`}/>:<div className="map-fallback"><span>⌖</span><strong>{address||name}</strong><small>Carte Google disponible après configuration de la clé navigateur restreinte.</small></div>}
    <a href={directions} target="_blank" rel="noreferrer">Ouvrir l’itinéraire</a>
  </section>;
}

export function LocateMeButton({onLocated}:{onLocated:(point:GeoPoint)=>void}){
  const [status,setStatus]=useState("");
  function locate(){if(!navigator.geolocation){setStatus("Géolocalisation indisponible.");return;}setStatus("Localisation en cours…");navigator.geolocation.getCurrentPosition(position=>{const point={latitude:position.coords.latitude,longitude:position.coords.longitude};onLocated(point);setStatus("Position utilisée pour la recherche.");},error=>setStatus(error.code===error.PERMISSION_DENIED?"Autorisation de localisation refusée.":"Position introuvable."),{enableHighAccuracy:false,timeout:8000,maximumAge:300000});}
  return <div className="locate-me"><button type="button" onClick={locate}>⌖ Autour de moi</button>{status&&<small role="status">{status}</small>}</div>;
}
