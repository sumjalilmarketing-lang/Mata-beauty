"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { publicErrorMessage } from "@/lib/ui/public-error";

type CollaboratorChoice = { id: string; display_name: string };
type Assignment = { booking_id: string; business_id: string; collaborator_id: string | null; collaborators: CollaboratorChoice[] };

export function ConversationAssignment({ conversationId, enabled }: { conversationId: string; enabled: boolean }) {
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const client = getSupabaseBrowserClient();
    if (!client) return;
    void client.rpc("owner_get_conversation_assignment", { target_conversation_id: conversationId }).then(result => {
      if (!active) return;
      if (result.error || !result.data || typeof result.data !== "object") return;
      setAssignment(result.data as Assignment);
    });
    return () => { active = false; };
  }, [conversationId, enabled]);

  async function assign(collaboratorId: string) {
    const client = getSupabaseBrowserClient();
    if (!client || busy) return;
    setBusy(true); setMessage("");
    try {
      const result = await client.rpc("owner_assign_conversation", { target_conversation_id: conversationId, target_collaborator_id: collaboratorId || null });
      if (result.error) throw result.error;
      setAssignment(current => current ? { ...current, collaborator_id: collaboratorId || null } : current);
      setMessage("Attribution mise à jour.");
    } catch (caught) { setMessage(publicErrorMessage(caught, "L'attribution n'a pas pu être modifiée.")); }
    finally { setBusy(false); }
  }

  if (!assignment) return null;
  return <section className="conversation-assignment" aria-label="Attribution de la conversation"><label>Collaborateur assigné<select required disabled={busy} value={assignment.collaborator_id ?? ""} onChange={event => void assign(event.target.value)}><option value="" disabled>Choisir un collaborateur</option>{assignment.collaborators.map(person => <option key={person.id} value={person.id}>{person.display_name}</option>)}</select></label>{message && <p role="status">{message}</p>}</section>;
}
