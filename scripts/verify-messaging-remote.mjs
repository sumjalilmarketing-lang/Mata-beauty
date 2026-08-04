import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

assert.ok(url, "NEXT_PUBLIC_SUPABASE_URL is required");
assert.ok(anonKey, "NEXT_PUBLIC_SUPABASE_ANON_KEY is required");
assert.ok(serviceRoleKey, "SUPABASE_SERVICE_ROLE_KEY is required");

const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const runId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
const password = `Mata-Remote-${randomUUID()}!`;
const createdUserIds = [];
const testClients = [];
let bookingId = null;
let conversationId = null;
let providerServiceId = null;

function userClient() {
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function createTestUser(label, professionalIntent = false) {
  const email = `codex-messaging-${label}-${runId}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      display_name: `Mata ${label}`,
      legal_accepted: "true",
      professional_intent: professionalIntent ? "true" : "false",
    },
  });
  assert.ifError(error);
  assert.ok(data.user, `Unable to create ${label} user`);
  createdUserIds.push(data.user.id);

  const client = userClient();
  testClients.push(client);
  const { data: signInData, error: signInError } = await client.auth.signInWithPassword({ email, password });
  assert.ifError(signInError);
  assert.ok(signInData.session?.access_token, `Unable to authenticate ${label} realtime session`);
  await client.realtime.setAuth(signInData.session.access_token);
  return { client, id: data.user.id };
}

function realtimeEvent(channel, event, table, filter, predicate = () => true) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Realtime timeout: ${table} ${event}`)), 15_000);
    channel.on("postgres_changes", { event, schema: "public", table, filter }, (payload) => {
      if (!predicate(payload)) return;
      clearTimeout(timeout);
      resolve(payload);
    });
  });
}

function subscribe(channel) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Realtime subscription timeout")), 15_000);
    channel.subscribe((status, error) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(timeout);
        resolve();
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        clearTimeout(timeout);
        reject(error ?? new Error(`Realtime subscription failed: ${status}`));
      }
    });
  });
}

async function main() {
  const clientUser = await createTestUser("client");
  const providerUser = await createTestUser("provider", true);
  const outsiderUser = await createTestUser("outsider");

  const { data: baseService, error: baseServiceError } = await admin
    .from("services")
    .select("id")
    .eq("is_active", true)
    .limit(1)
    .single();
  assert.ifError(baseServiceError);

  const { data: providerService, error: providerServiceError } = await admin
    .from("provider_services")
    .insert({
      provider_id: providerUser.id,
      service_id: baseService.id,
      title: `Recette messagerie ${runId}`,
      duration_minutes: 60,
      price_amount: 10_000,
      currency: "XOF",
      is_active: true,
    })
    .select("id")
    .single();
  assert.ifError(providerServiceError);
  providerServiceId = providerService.id;

  const startsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  startsAt.setUTCHours(10, 0, 0, 0);
  const { data: booking, error: bookingError } = await clientUser.client
    .from("bookings")
    .insert({
      client_id: clientUser.id,
      provider_id: providerUser.id,
      provider_service_id: providerServiceId,
      starts_at: startsAt.toISOString(),
      ends_at: new Date(startsAt.getTime() + 60 * 60 * 1000).toISOString(),
      status: "pending",
      location_mode: "salon",
      total_amount: 1,
      currency: "EUR",
    })
    .select("id,provider_id,total_amount,currency")
    .single();
  assert.ifError(bookingError);
  bookingId = booking.id;
  assert.equal(booking.provider_id, providerUser.id, "Server must own provider attribution");
  assert.equal(booking.total_amount, 10_000, "Server must own booking price");
  assert.equal(booking.currency, "XOF", "Server must own booking currency");

  const { data: clientConversation, error: clientConversationError } = await clientUser.client.rpc(
    "ensure_booking_conversation",
    { target_booking_id: bookingId },
  );
  assert.ifError(clientConversationError);
  conversationId = clientConversation;

  const { data: providerConversation, error: providerConversationError } = await providerUser.client.rpc(
    "ensure_booking_conversation",
    { target_booking_id: bookingId },
  );
  assert.ifError(providerConversationError);
  assert.equal(providerConversation, conversationId, "Both participants must share one conversation");

  const { error: outsiderConversationError } = await outsiderUser.client.rpc(
    "ensure_booking_conversation",
    { target_booking_id: bookingId },
  );
  assert.ok(outsiderConversationError, "An outsider must not create or open the conversation");

  const providerChannel = providerUser.client.channel(`remote-provider-${runId}`);
  const providerIncoming = realtimeEvent(
    providerChannel,
    "INSERT",
    "messages",
    `conversation_id=eq.${conversationId}`,
    (payload) => payload.new.sender_id === clientUser.id,
  );
  await subscribe(providerChannel);

  const clientBody = `Bonjour depuis la cliente ${runId}`;
  const { data: clientMessage, error: clientMessageError } = await clientUser.client
    .from("messages")
    .insert({ conversation_id: conversationId, sender_id: clientUser.id, body: clientBody })
    .select("id,created_at")
    .single();
  assert.ifError(clientMessageError);
  const providerPayload = await providerIncoming;
  assert.equal(providerPayload.new.body, clientBody, "Provider must receive the client message in realtime");

  const clientReceiptChannel = clientUser.client.channel(`remote-receipt-${runId}`);
  const providerReadEvent = realtimeEvent(
    clientReceiptChannel,
    "UPDATE",
    "conversation_members",
    `conversation_id=eq.${conversationId}`,
    (payload) => payload.new.profile_id === providerUser.id && Boolean(payload.new.last_read_at),
  );
  await subscribe(clientReceiptChannel);
  const { data: providerReadAt, error: providerReadError } = await providerUser.client.rpc(
    "mark_conversation_read",
    { target_conversation_id: conversationId },
  );
  assert.ifError(providerReadError);
  const readPayload = await providerReadEvent;
  assert.equal(readPayload.new.last_read_at, providerReadAt, "Read receipt must be delivered in realtime");
  assert.ok(providerReadAt >= clientMessage.created_at, "Read receipt must be newer than the message");

  const clientIncomingChannel = clientUser.client.channel(`remote-client-${runId}`);
  const clientIncoming = realtimeEvent(
    clientIncomingChannel,
    "INSERT",
    "messages",
    `conversation_id=eq.${conversationId}`,
    (payload) => payload.new.sender_id === providerUser.id,
  );
  await subscribe(clientIncomingChannel);
  const providerBody = `Réponse du professionnel ${runId}`;
  const { error: providerMessageError } = await providerUser.client.from("messages").insert({
    conversation_id: conversationId,
    sender_id: providerUser.id,
    body: providerBody,
  });
  assert.ifError(providerMessageError);
  const clientPayload = await clientIncoming;
  assert.equal(clientPayload.new.body, providerBody, "Client must receive the provider response in realtime");

  const { error: clientReadError } = await clientUser.client.rpc("mark_conversation_read", {
    target_conversation_id: conversationId,
  });
  assert.ifError(clientReadError);

  const { data: notifications, error: notificationError } = await providerUser.client
    .from("notifications")
    .select("kind,data")
    .eq("profile_id", providerUser.id);
  assert.ifError(notificationError);
  const matchingNotification = notifications.find(
    (notification) => notification.kind === "message_created"
      && String(notification.data?.conversation_id) === String(conversationId),
  );
  assert.ok(matchingNotification, JSON.stringify({
    error: "Provider notification must reference the conversation",
    notificationCount: notifications.length,
    kinds: notifications.map((notification) => notification.kind),
    dataKeys: notifications.map((notification) => Object.keys(notification.data ?? {})),
  }));

  const { data: outsiderMessages, error: outsiderReadError } = await outsiderUser.client
    .from("messages")
    .select("id")
    .eq("conversation_id", conversationId);
  assert.ifError(outsiderReadError);
  assert.deepEqual(outsiderMessages, [], "RLS must hide messages from an outsider");

  const { data: outsiderMembers, error: outsiderMembersError } = await outsiderUser.client
    .from("conversation_members")
    .select("profile_id")
    .eq("conversation_id", conversationId);
  assert.ifError(outsiderMembersError);
  assert.deepEqual(outsiderMembers, [], "RLS must hide memberships from an outsider");

  const { error: outsiderInsertError } = await outsiderUser.client.from("messages").insert({
    conversation_id: conversationId,
    sender_id: outsiderUser.id,
    body: "Message interdit",
  });
  assert.ok(outsiderInsertError, "RLS must reject an outsider message");

  const { error: spoofedSenderError } = await clientUser.client.from("messages").insert({
    conversation_id: conversationId,
    sender_id: providerUser.id,
    body: "Usurpation interdite",
  });
  assert.ok(spoofedSenderError, "RLS must reject sender spoofing");

  const { error: outsiderReadReceiptError } = await outsiderUser.client.rpc("mark_conversation_read", {
    target_conversation_id: conversationId,
  });
  assert.ok(outsiderReadReceiptError, "An outsider must not set a read receipt");

  const { data: participantMessages, error: participantReadError } = await clientUser.client
    .from("messages")
    .select("id")
    .eq("conversation_id", conversationId);
  assert.ifError(participantReadError);
  assert.equal(participantMessages.length, 2, "Participants must see both messages and no rejected writes");

  await Promise.all([
    providerUser.client.removeChannel(providerChannel),
    clientUser.client.removeChannel(clientReceiptChannel),
    clientUser.client.removeChannel(clientIncomingChannel),
  ]);

  console.log(JSON.stringify({
    ok: true,
    bookingCreated: true,
    singleConversation: true,
    realtimeClientToProvider: true,
    realtimeProviderToClient: true,
    realtimeReadReceipt: true,
    notificationCreated: true,
    rlsOutsiderReadBlocked: true,
    rlsOutsiderWriteBlocked: true,
    rlsSenderSpoofingBlocked: true,
    messageCount: participantMessages.length,
  }));
}

try {
  await main();
} finally {
  for (const client of testClients) client.realtime.disconnect();
  if (conversationId) await admin.from("conversations").delete().eq("id", conversationId);
  if (bookingId) await admin.from("bookings").delete().eq("id", bookingId);
  if (providerServiceId) await admin.from("provider_services").delete().eq("id", providerServiceId);
  for (const userId of createdUserIds.reverse()) {
    await admin.auth.admin.deleteUser(userId);
  }
}
