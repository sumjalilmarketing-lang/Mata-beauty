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
  return createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
  if (url.pathname === "/health") return respond(response, 200, { ok: true });
  if (url.pathname === "/rest/v1/provider_profiles") {
    return respond(response, 200, {
      profile_id: providerId,
      slug: "mata-audit-tresses",
      business_name: "Mata Audit Tresses",
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
    return respond(response, 200, { avatar_url: null, username: "mata-audit-tresses" });
  }
  if (url.pathname === "/rest/v1/provider_services") {
    return respond(response, 200, [{ id: serviceId, title: "Tresses express", description: "", duration_minutes: 60, price_amount: 10000, currency: "XOF" }]);
  }
  if (url.pathname === "/rest/v1/businesses") {
    return respond(response, 406, { code: "PGRST116", details: "The result contains 0 rows", message: "JSON object requested, multiple (or no) rows returned" });
  }
  if (url.pathname === "/rest/v1/social_feed" || url.pathname === "/rest/v1/reviews" || url.pathname === "/rest/v1/follows" || url.pathname === "/rest/v1/provider_categories") {
    const isHead = request.method === "HEAD" || url.searchParams.get("select") !== null && request.headers.prefer?.includes("count=");
    return respond(response, 200, isHead ? null : [], isHead ? { "Content-Range": "*/0" } : {});
  }
  return respond(response, 200, []);
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
