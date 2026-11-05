"use client";
import { useEffect, useId, useRef, useState } from "react";
import { internationalPhone, isInternationalPhone, PHONE_COUNTRIES, splitPhone } from "@/lib/domain/phone-number";
import "./phone-input.css";

type Props = { name?: string; defaultValue?: string | null; defaultCountry?: string | null; required?: boolean; disabled?: boolean; label?: string };
export function PhoneInput({name="phone",defaultValue="",defaultCountry="SN",required=false,disabled=false,label="Téléphone"}:Props) {
  const id=useId(), input=useRef<HTMLInputElement>(null);
  const [value,setValue]=useState(()=>splitPhone(defaultValue??"",defaultCountry??"SN"));
  useEffect(()=>{
    const form=input.current?.form;
    const reset=()=>{setValue(splitPhone(defaultValue??"",defaultCountry??"SN"));input.current?.setCustomValidity("");};
    form?.addEventListener("reset",reset);
    return ()=>form?.removeEventListener("reset",reset);
  },[defaultValue,defaultCountry]);
  const full=internationalPhone(value.number,value.country);
  function validate(number:string,country:string) {
    const formatted=internationalPhone(number,country);
    input.current?.setCustomValidity(formatted && !isInternationalPhone(formatted) ? "Vérifiez le numéro et son indicatif (8 à 15 chiffres au total)." : "");
  }
  return <div className="phone-field"><span id={`${id}-label`}>{label}</span><div className="phone-field-controls">
    <select aria-label={`${label} : pays et indicatif`} disabled={disabled} value={value.country} onChange={event=>{const country=event.target.value;setValue(previous=>({...previous,country:PHONE_COUNTRIES.find(item=>item.code===country)!.code}));validate(value.number,country);}}>
      {PHONE_COUNTRIES.map(country=><option value={country.code} key={country.code}>{country.name} (+{country.dial})</option>)}
    </select>
    <input ref={input} type="tel" inputMode="tel" aria-labelledby={`${id}-label`} autoComplete="tel-national" placeholder="Numéro de téléphone" maxLength={40} required={required} disabled={disabled} value={value.number} onChange={event=>{const next=splitPhone(event.target.value,value.country);setValue(next);validate(next.number,next.country);}} onBlur={()=>validate(value.number,value.country)} />
    <input type="hidden" name={name} value={full} disabled={disabled}/>
  </div><small>Indicatif automatique · {full || "Saisissez le numéro sans l’indicatif."}</small></div>;
}
