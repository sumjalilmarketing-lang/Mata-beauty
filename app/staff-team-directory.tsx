"use client";
import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
type Colleague = {
    business_id: string;
    collaborator_id: string;
    display_name: string;
    title: string | null;
};
export function StaffTeamDirectory() { const [rows, setRows] = useState<Colleague[]>([]); const [error, setError] = useState(false); useEffect(() => { let active = true; const api = getSupabaseBrowserClient(); if (api)
    void api.rpc("get_my_team_directory").then(({ data, error }) => { if (active) {
        setRows((data ?? []) as Colleague[]);
        setError(Boolean(error));
    } }); return () => { active = false; }; }, []); return <details><summary>Mon équipe</summary>{error ? <p role="alert">Équipe indisponible.</p> : <ul>{rows.map(p => <li key={p.collaborator_id}>{p.display_name}{p.title ? ` · ${p.title}` : ""}</li>)}</ul>}<p>Les plannings personnels de vos collègues restent privés.</p></details>; }
