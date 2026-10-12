export type ConversationSummary = {
  conversation_id: string;
  booking_id: string | null;
  client_id: string;
  provider_id: string;
  starts_at: string | null;
  status: string | null;
  service_title: string | null;
  other_profile_id: string;
  other_display_name: string;
  other_avatar_url: string | null;
  unread_count: number;
  last_message_at: string;
  last_message_body: string | null;
  last_message_type: string | null;
  archived_at: string | null;
};

export type ConversationMessage = {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
  message_type: string;
  metadata: Record<string, unknown> | null;
  client_nonce: string | null;
};

export type ConversationService = {
  id: string;
  provider_id: string;
  title: string;
  description: string | null;
  price_amount: number;
  currency: string;
  duration_minutes: number;
  cover_url: string | null;
  is_active: boolean;
};

export type ConversationQuote = {
  id: string;
  conversation_id: string;
  provider_id: string;
  client_id: string;
  provider_service_id: string;
  service_title: string;
  description: string;
  conditions: string;
  base_amount: number;
  options_amount: number;
  total_amount: number;
  currency: string;
  base_duration_minutes: number;
  duration_minutes: number;
  valid_until: string;
  status: string;
  version: number;
  booking_id: string | null;
  location_modes?: string[];
  fixed_travel_fee_amount?: number;
};

export const messageColumns = "id,sender_id,body,created_at,message_type,metadata,client_nonce";

export function mergeConversationMessages(current: ConversationMessage[], incoming: ConversationMessage[]) {
  const byId = new Map(current.map(message => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}

export function conversationDate(value: string | null, locale = "fr-SN") {
  if (!value || !Number.isFinite(Date.parse(value))) return "";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Dakar" }).format(new Date(value));
}

export function conversationPrice(amount: number, currency: string, locale = "fr-SN") {
  if (!Number.isFinite(amount) || !/^[A-Z]{3}$/.test(currency)) return "Prix indisponible";
  try { return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 }).format(amount); }
  catch { return "Prix indisponible"; }
}

export function messagePreview(type: string | null, body: string | null) {
  if (type === "image") return "Photo";
  if (type === "video") return "Vidéo";
  if (type === "quote") return "Devis personnalisé";
  if (type === "catalog") return "Catalogue de prestations";
  return body || "Commencer la conversation";
}

export function sentMessage(result: unknown): ConversationMessage {
  const value = result as { ok?: boolean; blocked?: boolean; message?: ConversationMessage } | null;
  if (value?.blocked) throw new Error("mata_anti_circumvention:contact_details");
  if (!value?.message?.id || value.ok === false) throw new Error("message_unavailable");
  return value.message;
}
