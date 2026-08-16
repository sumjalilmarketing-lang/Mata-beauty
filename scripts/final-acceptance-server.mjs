import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { createClient } from "@supabase/supabase-js";
import { browserAccount, browserLoginLink, finishFinalAcceptance, startFinalAcceptance } from "./final-acceptance-harness.mjs";

const previewUrl = process.env.MATA_PREVIEW_URL ?? "https://mata-beauty-3bn126hnu-africrm.vercel.app/";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert.ok(serviceKey, "SUPABASE_SERVICE_ROLE_KEY est requis");

function localValue(name) {
  const source = readFileSync(".env.local", "utf8");
  const match = source.match(new RegExp(`^${name}=(.*)$`, "m"));
  return match?.[1]?.trim().replace(/^['"]|['"]$/g, "");
}

const url = localValue("NEXT_PUBLIC_SUPABASE_URL") ?? "https://qjdwxdbvrxedyfolnpol.supabase.co";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? localValue("NEXT_PUBLIC_SUPABASE_ANON_KEY");
assert.ok(anonKey, "NEXT_PUBLIC_SUPABASE_ANON_KEY est requis");

let report = null;
let starting = null;

async function ensureStarted() {
  if (report) return report;
  starting ??= startFinalAcceptance({ url, anonKey, serviceKey, previewUrl, createClient });
  report = await starting;
  return report;
}

const server = createServer(async (request, response) => {
  try {
    const target = new URL(request.url ?? "/", "http://127.0.0.1:4399");
    if (target.pathname === "/health") {
      response.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      response.end(JSON.stringify({ ok: true }));
      return;
    }
    if (target.pathname === "/status" || target.pathname === "/start") {
      const result = await ensureStarted();
      response.writeHead(result.ok ? 200 : 500, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      response.end(JSON.stringify(result));
      return;
    }
    if (target.pathname.startsWith("/login/")) {
      const result = await ensureStarted();
      assert.ok(result.ok, "La recette distante a échoué");
      const role = decodeURIComponent(target.pathname.slice("/login/".length));
      const returnTo = target.searchParams.get("returnTo") ?? "/";
      const actionLink = await browserLoginLink(role, returnTo);
      response.writeHead(302, { location: actionLink, "cache-control": "no-store", "referrer-policy": "no-referrer" });
      response.end();
      return;
    }
    if (target.pathname.startsWith("/credentials/")) {
      const result = await ensureStarted();
      assert.ok(result.ok, "La recette distante a échoué");
      const role = decodeURIComponent(target.pathname.slice("/credentials/".length));
      response.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer" });
      response.end(JSON.stringify(browserAccount(role)));
      return;
    }
    if (target.pathname === "/cleanup") {
      const cleaned = await finishFinalAcceptance();
      response.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      response.end(JSON.stringify(cleaned));
      setTimeout(() => server.close(), 100);
      return;
    }
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
  } catch (error) {
    response.writeHead(500, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    response.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
  }
});

server.listen(4399, "127.0.0.1", () => {
  console.log(JSON.stringify({ ready: true, endpoint: "http://127.0.0.1:4399/start" }));
});

function shutdown() {
  void finishFinalAcceptance().finally(() => server.close());
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
