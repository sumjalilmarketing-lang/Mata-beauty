import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert.ok(url && anonKey && serviceKey, "Supabase remote credentials are required");

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const password = `Mata-Social-${randomUUID()}!`;
const run = `${Date.now()}-${randomUUID().slice(0, 6)}`;
const users = [];
let serviceId = null;
let postId = null;
let draftId = null;
let bookingId = null;
const mediaPaths = [];

async function user(label, professional = false) {
  const email = `codex-social-${label}-${run}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: `Social ${label}`, legal_accepted: "true", professional_intent: professional ? "true" : "false" } });
  assert.ifError(error); users.push(data.user.id);
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const signed = await client.auth.signInWithPassword({ email, password });
  assert.ifError(signed.error);
  return { id: data.user.id, client };
}

async function main() {
  const creator = await user("creator", true);
  const client = await user("client");
  const outsider = await user("outsider");
  const { error: approvalError } = await admin.from("provider_profiles").update({ status: "approved" }).eq("profile_id", creator.id);
  assert.ifError(approvalError);
  const base = await admin.from("services").select("id").eq("is_active", true).limit(1).single();
  assert.ifError(base.error);
  const service = await admin.from("provider_services").insert({ provider_id: creator.id, service_id: base.data.id, title: `Social E2E ${run}`, duration_minutes: 60, price_amount: 15000, currency: "XOF", is_active: true }).select("id").single();
  assert.ifError(service.error); serviceId = service.data.id;

  postId = randomUUID();
  const mediaPath = `${creator.id}/${postId}/video.mp4`;
  const thumbnailPath = `${creator.id}/${postId}/thumbnail.jpg`;
  mediaPaths.push(mediaPath, thumbnailPath);
  const upload = await creator.client.storage.from("provider-social-media").upload(mediaPath, new Blob([new Uint8Array([0, 0, 0, 20])], { type: "video/mp4" }), { contentType: "video/mp4" });
  assert.ifError(upload.error);
  const thumbnailUpload = await creator.client.storage.from("provider-social-media").upload(thumbnailPath, new Blob([new Uint8Array([255, 216, 255, 217])], { type: "image/jpeg" }), { contentType: "image/jpeg" });
  assert.ifError(thumbnailUpload.error);
  const forbiddenUpload = await outsider.client.storage.from("provider-social-media").upload(`${creator.id}/${randomUUID()}/video.mp4`, new Blob(["x"], { type: "video/mp4" }), { contentType: "video/mp4" });
  assert.ok(forbiddenUpload.error, "RLS must reject upload into another creator folder");
  const videoUrl = creator.client.storage.from("provider-social-media").getPublicUrl(mediaPath).data.publicUrl;
  const thumbnailUrl = creator.client.storage.from("provider-social-media").getPublicUrl(thumbnailPath).data.publicUrl;

  const published = await creator.client.rpc("create_provider_video_post", { target_post_id: postId, target_title: "Tresses premium E2E", target_caption: "Tresses premium E2E", target_video_path: mediaPath, target_video_url: videoUrl, target_thumbnail_path: thumbnailPath, target_thumbnail_url: thumbnailUrl, target_duration_seconds: 30, target_aspect_ratio: 0.562, target_provider_service_id: serviceId, target_status: "published", target_allow_comments: true, target_client_consent: true, target_scheduled_for: null, target_visibility: "public", target_hashtags: ["Tresses", "Dakar"], target_location: "Dakar", target_available_at: null });
  assert.ifError(published.error); assert.equal(published.data, postId);
  const noService = await creator.client.rpc("create_provider_video_post", { target_post_id: randomUUID(), target_title: "Interdite", target_caption: "Publication interdite", target_video_path: mediaPath, target_video_url: videoUrl, target_thumbnail_path: thumbnailPath, target_thumbnail_url: thumbnailUrl, target_duration_seconds: 30, target_aspect_ratio: 0.562, target_provider_service_id: null, target_status: "published", target_allow_comments: true, target_client_consent: true, target_scheduled_for: null, target_visibility: "public", target_hashtags: [], target_location: null, target_available_at: null });
  assert.ok(noService.error, "Published videos must require a service");
  draftId = randomUUID();
  const draftVideoPath = `${creator.id}/${draftId}/video.mp4`;
  const draftThumbnailPath = `${creator.id}/${draftId}/thumbnail.jpg`;
  mediaPaths.push(draftVideoPath, draftThumbnailPath);
  assert.ifError((await creator.client.storage.from("provider-social-media").upload(draftVideoPath, new Blob([new Uint8Array([0, 0, 0, 20])], { type: "video/mp4" }), { contentType: "video/mp4" })).error);
  assert.ifError((await creator.client.storage.from("provider-social-media").upload(draftThumbnailPath, new Blob([new Uint8Array([255, 216, 255, 217])], { type: "image/jpeg" }), { contentType: "image/jpeg" })).error);
  const draftVideoUrl = creator.client.storage.from("provider-social-media").getPublicUrl(draftVideoPath).data.publicUrl;
  const draftThumbnailUrl = creator.client.storage.from("provider-social-media").getPublicUrl(draftThumbnailPath).data.publicUrl;
  const draft = await creator.client.rpc("create_provider_video_post", { target_post_id: draftId, target_title: "Brouillon", target_caption: "Brouillon privé", target_video_path: draftVideoPath, target_video_url: draftVideoUrl, target_thumbnail_path: draftThumbnailPath, target_thumbnail_url: draftThumbnailUrl, target_duration_seconds: 30, target_aspect_ratio: 0.562, target_provider_service_id: null, target_status: "draft", target_allow_comments: true, target_client_consent: false, target_scheduled_for: null, target_visibility: "public", target_hashtags: [], target_location: null, target_available_at: null });
  assert.ifError(draft.error);

  const feed = await outsider.client.from("social_feed").select("id,hashtags,provider_service_id").eq("id", postId).single();
  assert.ifError(feed.error); assert.deepEqual(feed.data.hashtags, ["dakar", "tresses"]); assert.equal(feed.data.provider_service_id, serviceId);
  const hiddenDraft = await outsider.client.from("posts").select("id").eq("id", draftId);
  assert.ifError(hiddenDraft.error); assert.equal(hiddenDraft.data.length, 0);
  assert.ok((await outsider.client.storage.from("provider-social-media").createSignedUrl(draftVideoPath, 60)).error, "Draft media must remain private");
  assert.ifError((await creator.client.storage.from("provider-social-media").createSignedUrl(draftVideoPath, 60)).error);
  assert.ifError((await outsider.client.storage.from("provider-social-media").createSignedUrl(mediaPath, 60)).error);
  const forgedCounter = await outsider.client.from("posts").update({ like_count: 999999 }).eq("id", postId).select("id");
  assert.ifError(forgedCounter.error); assert.equal(forgedCounter.data.length, 0, "RLS must prevent direct counter writes by outsiders");
  const foreignEdit = await outsider.client.from("posts").update({ caption: "hacked" }).eq("id", postId).select("id");
  assert.ifError(foreignEdit.error); assert.equal(foreignEdit.data.length, 0, "RLS must prevent foreign creator edits");

  const firstLike = await client.client.rpc("toggle_post_like", { target_post_id: postId });
  const unlike = await client.client.rpc("toggle_post_like", { target_post_id: postId });
  assert.ifError(firstLike.error); assert.ifError(unlike.error);
  assert.equal(firstLike.data.active, true); assert.equal(unlike.data.active, false);
  const saved = await client.client.rpc("toggle_post_save", { target_post_id: postId });
  assert.equal(saved.data.active, true);
  const followed = await client.client.rpc("toggle_follow_provider", { target_provider_id: creator.id });
  assert.equal(followed.data, true);

  const comment = await client.client.from("post_comments").insert({ post_id: postId, author_id: client.id, body: "Très beau résultat" }).select("id").single();
  assert.ifError(comment.error);
  const reply = await creator.client.from("post_comments").insert({ post_id: postId, author_id: creator.id, parent_id: comment.data.id, body: "Merci beaucoup" }).select("id").single();
  assert.ifError(reply.error);
  const deleteOther = await outsider.client.from("post_comments").delete().eq("id", comment.data.id).select("id");
  assert.ifError(deleteOther.error); assert.equal(deleteOther.data.length, 0);
  const report = await outsider.client.rpc("report_post_comment", { target_comment_id: comment.data.id, target_reason: "spam" });
  assert.ifError(report.error);

  const sessionHash = "a".repeat(64);
  await outsider.client.rpc("record_video_view", { target_post_id: postId, target_session_hash: sessionHash, target_watched_ms: 2000, target_completed: false });
  await outsider.client.rpc("record_video_view", { target_post_id: postId, target_session_hash: sessionHash, target_watched_ms: 30000, target_completed: true });
  const views = await admin.from("video_views").select("watched_ms,completed").eq("post_id", postId).eq("session_hash", sessionHash).single();
  assert.equal(views.data.watched_ms, 30000); assert.equal(views.data.completed, true);
  const counter = await admin.from("posts").select("view_count").eq("id", postId).single();
  assert.equal(counter.data.view_count, 1, "View upsert must increment once");
  await client.client.rpc("record_post_booking_click", { target_post_id: postId, target_session_hash: "b".repeat(64) });

  const collection = await client.client.from("inspiration_collections").insert({ owner_id: client.id, name: "Tresses mariage" }).select("id").single();
  assert.ifError(collection.error);
  await client.client.from("inspiration_collection_posts").insert({ collection_id: collection.data.id, post_id: postId });
  const foreignCollections = await outsider.client.from("inspiration_collections").select("id").eq("id", collection.data.id);
  assert.equal(foreignCollections.data.length, 0);

  const starts = new Date(Date.now() + 40 * 86400000); starts.setUTCHours(10, 0, 0, 0);
  const booking = await client.client.from("bookings").insert({ client_id: client.id, provider_id: outsider.id, provider_service_id: serviceId, source_post_id: postId, starts_at: starts.toISOString(), ends_at: new Date(starts.getTime()+3600000).toISOString(), location_mode: "salon", total_amount: 1, currency: "EUR" }).select("id,provider_id,total_amount,currency,source_post_id").single();
  assert.ifError(booking.error); bookingId = booking.data.id;
  assert.equal(booking.data.provider_id, creator.id); assert.equal(booking.data.total_amount, 15000); assert.equal(booking.data.currency, "XOF"); assert.equal(booking.data.source_post_id, postId);
  const stats = await creator.client.rpc("provider_creator_statistics");
  assert.ifError(stats.error); const stat = stats.data.find((row) => row.post_id === postId);
  assert.ok(stat); assert.equal(Number(stat.booking_clicks), 1); assert.equal(Number(stat.bookings), 1);

  console.log(JSON.stringify({ ok: true, migrationObjects: true, publishedRequiresService: true, draftPrivate: true, countersProtected: true, foreignEditBlocked: true, uploadIsolation: true, likeUnlikeIdempotent: true, saveAndFollow: true, commentReplyDeleteReportRls: true, viewUpsertAndCompletion: true, collectionsPrivate: true, bookingAttributionAndServerPrice: true, creatorStatistics: true }));
}

try { await main(); } finally {
  if (bookingId) await admin.from("bookings").delete().eq("id", bookingId);
  if (postId || draftId) await admin.from("posts").delete().in("id", [postId, draftId].filter(Boolean));
  if (mediaPaths.length && users[0]) await admin.storage.from("provider-social-media").remove(mediaPaths);
  if (serviceId) await admin.from("provider_services").delete().eq("id", serviceId);
  for (const id of users.reverse()) await admin.auth.admin.deleteUser(id);
}
