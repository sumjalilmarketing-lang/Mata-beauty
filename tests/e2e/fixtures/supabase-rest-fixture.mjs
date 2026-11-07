import { randomUUID } from "node:crypto";
import {handleDepartmentFixture} from "./department-workspaces.mjs";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

// Local-only PostgREST-shaped fixture used to render SSR profile routes in E2E.
// It contains fictitious data and does not validate Supabase Auth, RLS, or Storage.
const providerId = "11111111-1111-4111-8111-111111111111";
const serviceId = "22222222-2222-4222-8222-222222222222";

function respond(response, status, body, headers = {}) {
  response.writeHead(status, { "Content-Type": "application/json", ...headers });
  response.end(body === null ? "" : JSON.stringify(body));
}

export function createSupabaseFixtureServer(port) {
  const uploads = new Map();
  return createServer(async(request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
  const testPort = Number(process.env.MATA_PLAYWRIGHT_PORT ?? 3160);
  const origin = request.headers.origin;
  const allowedOrigins = new Set([`http://127.0.0.1:${testPort}`, `http://localhost:${testPort}`]);
  const corsHeaders = typeof origin === "string" && allowedOrigins.has(origin)
    ? {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, HEAD, POST, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "accept, accept-profile, apikey, authorization, content-type, content-profile, prefer, range, x-client-info, x-supabase-api-version, x-upsert, upload-length, upload-offset, upload-metadata, tus-resumable, upload-concat, upload-defer-length, x-http-method-override",
      "Access-Control-Expose-Headers": "content-range, range, x-total-count, location, upload-offset, tus-resumable, upload-length",
      "Access-Control-Max-Age": "600",
      Vary: "Origin",
    }
    : {};
  const send = (status, body, headers = {}) => respond(response, status, body, { ...corsHeaders, ...headers });
  if (request.method === "OPTIONS") {
    response.writeHead(204, corsHeaders);
    response.end();
    return;
  }
  // Receive actual bytes over HTTP: browser route interception cannot reliably
  // expose Blob PATCH bodies in every engine (notably WebKit).
  if (url.pathname.startsWith("/storage/v1/upload/resumable")) {
    const headers = { "Tus-Resumable": "1.0.0" };
    if (request.method === "POST") {
      const length = Number(request.headers["upload-length"]);
      if (!Number.isSafeInteger(length) || length <= 0 || length > 100 * 1024 * 1024) return send(400, { message: "Invalid fixture length" }, headers);
      const id = randomUUID();
      let offset = 0;
      for await (const chunk of request) offset += chunk.length;
      if (offset > length) return send(400, { message: "Invalid fixture body" }, headers);
      uploads.set(id, { length, offset });
      return send(201, null, { ...headers, Location: `http://127.0.0.1:${port}/storage/v1/upload/resumable/${id}`, "Upload-Offset": String(offset) });
    }
    const upload = uploads.get(url.pathname.split("/").pop());
    if (!upload) return send(404, { message: "Unknown fixture upload" }, headers);
    if (request.method === "HEAD") return send(200, null, { ...headers, "Upload-Length": String(upload.length), "Upload-Offset": String(upload.offset) });
    if (request.method === "PATCH") {
      if (Number(request.headers["upload-offset"]) !== upload.offset) return send(409, null, headers);
      let received = 0;
      for await (const chunk of request) received += chunk.length;
      if (upload.offset + received > upload.length) return send(400, null, headers);
      upload.offset += received;
      return send(204, null, { ...headers, "Upload-Offset": String(upload.offset) });
    }
    return send(405, null, headers);
  }
  if(await handleDepartmentFixture(request,response,send))return;
  // The own-profile loader uses a server credential, so scope its synthetic
  // record by ID rather than relying on a browser fixture JWT.
  const auditClientId="aaaaaaaa-aaaa-4aaa-8aaa-000000000008";
  if(url.pathname==="/rest/v1/profiles" && url.searchParams.get("id")==="eq."+auditClientId) return send(200,{id:auditClientId,role:"client",is_suspended:false,account_status:"active",username:"recette_client",display_name:"Client Recette",first_name:"Client",last_name:"Recette",avatar_url:null,bio:""});
  if(url.pathname==="/rest/v1/account_roles" && url.searchParams.get("profile_id")==="eq."+auditClientId) return send(200,[{role:"customer"}]);
  if (url.pathname === "/health") return send(200, { ok: true });
  if (["/rest/v1/profiles", "/rest/v1/provider_profiles"].includes(url.pathname) && [...url.searchParams.values()].some(value => value.startsWith("in."))) return send(200, []);
  if (url.pathname === "/rest/v1/provider_profiles") {
    return send(200, {
      profile_id: providerId,
      slug: "mata-audit-tresses",
      business_name: "Mata Audit Tresses",
      logo_url: `http://127.0.0.1:${testPort}/brand/icon-512.png`,
      bio: "Spécialiste des tresses rapides à Dakar.",
      city: "Dakar",
      cover_url: null,
      average_rating: 4.9,
      review_count: 48,
      verified_at: "2026-01-01T00:00:00Z",
      provider_services: [{ id: serviceId, title: "Tresses express", duration_minutes: 60, price_amount: 10000 }],
    });
  }
  if (url.pathname === "/rest/v1/profiles") {
    return send(200, { avatar_url: null, username: "mata-audit-tresses" });
  }
  if (url.pathname === "/rest/v1/provider_services") {
    return send(200, [{ id: serviceId, title: "Tresses express", description: "", duration_minutes: 60, price_amount: 10000, currency: "XOF" }]);
  }
  if (url.pathname === "/rest/v1/businesses") {
    return send(406, { code: "PGRST116", details: "The result contains 0 rows", message: "JSON object requested, multiple (or no) rows returned" });
  }
  if (url.pathname === "/rest/v1/social_feed" || url.pathname === "/rest/v1/reviews" || url.pathname === "/rest/v1/follows" || url.pathname === "/rest/v1/provider_categories") {
    const isHead = request.method === "HEAD" || url.searchParams.get("select") !== null && request.headers.prefer?.includes("count=");
    return send(200, isHead ? null : [], isHead ? { "Content-Range": "*/0" } : {});
  }
  return send(200, []);
  });
}

export async function startSupabaseFixture(port) {
  const server = createSupabaseFixtureServer(port);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  return server;
}

async function runAsProcess() {
  const port = Number(process.argv[2] ?? 3111);
  const server = await startSupabaseFixture(port);
  let closing = false;
  async function shutdown() {
    if (closing) return;
    closing = true;
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    process.exit(0);
  }
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void runAsProcess();
}
