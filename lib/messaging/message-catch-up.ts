import type { SupabaseClient } from "@supabase/supabase-js";
export type ConversationMessage = { id: string; conversation_id: string; sender_id: string; body: string; created_at: string };

/** A refresh uses one fixed lower bound across all pages, including timestamp ties. */
export async function loadMessageCatchUp(client: SupabaseClient, ids: string[], since: string, signal: AbortSignal): Promise<ConversationMessage[]> {
  const messages: ConversationMessage[] = [];
  const pageSize = 50;
  for (let offset = 0; ; offset += pageSize) {
    const result = await client.from("messages").select("id,conversation_id,sender_id,body,created_at")
      .in("conversation_id", ids).is("deleted_at", null).gte("created_at", since)
      .order("created_at").order("id").range(offset, offset + pageSize - 1).abortSignal(signal);
    if (result.error) throw result.error;
    const page = (result.data ?? []) as ConversationMessage[];
    messages.push(...page);
    if (page.length < pageSize) return messages;
  }
}
