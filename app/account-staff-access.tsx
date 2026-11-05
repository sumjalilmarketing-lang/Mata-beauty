"use client";
import Link from "next/link";
import { useStaffAccess } from "./use-staff-access";

export function AccountStaffAccess() {
  const {available,error,retry}=useStaffAccess();
  if(error) return <p role="status">Votre accès collaborateur n’a pas pu être vérifié. <button type="button" onClick={retry}>Réessayer</button></p>;
  if(available === null) return null;
  if(!available) return <details className="account-staff-access"><summary>Mon espace collaborateur</summary><p>Aucun rattachement actif pour ce compte. Acceptez l’invitation personnelle du salon avec ce compte, ou connectez-vous au compte qui l’a déjà acceptée.</p><button type="button" onClick={retry}>Vérifier mon accès</button></details>;
  return <nav aria-label="Mon activité au salon" className="account-staff-access"><Link href="/staff">Ouvrir mon espace collaborateur →</Link><p>Mon agenda, mes prestations, mes tâches et mes disponibilités. Vous pouvez installer cet espace depuis sa page.</p></nav>;
}
