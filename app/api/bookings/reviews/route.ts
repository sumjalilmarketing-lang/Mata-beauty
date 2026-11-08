import { BodyTooLargeError, readBoundedText } from "@/lib/http/bounded-body";
import { z } from "zod";
import { authenticatedSupabase, hasTrustedOrigin, jsonError } from "@/lib/payments/server";
const input = z.object({ bookingId: z.uuid(), type: z.enum(["client_to_provider", "provider_to_client"]), rating: z.number().int().min(1).max(5), comment: z.string().trim().max(2000).default(""), criteria: z.array(z.enum(["quality", "welcome", "punctuality", "respect", "behaviour"])).max(5).default([]), visibility: z.enum(["public", "internal"]).default("public") }).strict();
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
    const auth = await authenticatedSupabase(request);
    if (!auth)
        return jsonError("Connexion requise.", 401, "unauthorized");
    const id = z.uuid().safeParse(new URL(request.url).searchParams.get("bookingId"));
    if (!id.success)
        return jsonError("Réservation invalide.", 400, "invalid_booking");
    const result = await auth.client.rpc("get_booking_reviews", { target_booking_id: id.data });
    if (result.error)
        return jsonError("Avis indisponibles.", 503, "unavailable");
    return Response.json({ reviews: result.data ?? [] }, { headers });
}
export async function POST(request: Request) {
    if (!hasTrustedOrigin(request))
        return jsonError("Accès refusé.", 403, "origin_rejected");
    const auth = await authenticatedSupabase(request);
    if (!auth)
        return jsonError("Connexion requise.", 401, "unauthorized");
    if (Number(request.headers.get("content-length") ?? 0) > 16384)
        return jsonError("Requête trop volumineuse.", 413, "payload_too_large");
    let body: unknown;
    try {
        body = JSON.parse(await readBoundedText(request, 16384));
    }
    catch (error) {
        if (error instanceof BodyTooLargeError) return jsonError("Requête trop volumineuse.", 413, "payload_too_large");
        return jsonError("Requête invalide.", 400, "invalid_json");
    }
    const parsed = input.safeParse(body);
    if (!parsed.success)
        return jsonError("Vérifiez votre avis.", 400, "invalid_review");
    const p = parsed.data;
    const result = await auth.client.rpc("submit_booking_review", { target_booking_id: p.bookingId, target_type: p.type, target_rating: p.rating, target_comment: p.comment, target_criteria: p.criteria, target_visibility: p.visibility });
    if (result.error)
        return jsonError("Avis déjà envoyé ou rendez-vous non autorisé.", 409, "review_rejected");
    return Response.json({ ok: true, id: result.data }, { status: 201, headers });
}
