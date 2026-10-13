import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  // The visual messaging demo is deliberately static and must never contact a
  // configured Supabase project (Preview deployments may inherit production env).
  if (request.nextUrl.pathname === "/messaging-v2-demo" || request.nextUrl.pathname.startsWith("/messaging-v2-demo/")) return response;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return response;

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookies) => {
        for (const { name, value } of cookies) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookies) {
          response.cookies.set(name, value, { ...options, path: "/", sameSite: "lax", secure: request.nextUrl.protocol === "https:" });
        }
      },
    },
  });
  await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const privilegedOrTechnical = /^\/(admin|onboarding|support-agent|moderation|finance|operations|auth)(\/|$)/.test(path)
    || /^\/api\/(admin|auth|cron|health)(\/|$)/.test(path)
    || path === "/api/payments/webhook"
    || /\.[a-z0-9]+$/i.test(path);
  if (!privilegedOrTechnical) {
    const state = await supabase.rpc("get_public_maintenance_state").abortSignal(AbortSignal.timeout(3000));
    if (!state.error && state.data?.enabled === true) {
      const message: string = typeof state.data.message === "string" ? state.data.message : "MATA Beauty revient très vite.";
      const headers = { "Cache-Control": "no-store", "Retry-After": "300" };
      if (path.startsWith("/api/")) return NextResponse.json({ error: "MAINTENANCE", message }, { status: 503, headers });
      const safe = message.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
      return new NextResponse(`<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MATA Beauty — Maintenance</title><body><main><h1>MATA Beauty est en maintenance</h1><p>${safe}</p><p>Réessayez dans quelques instants.</p><a href="/admin">Accès équipe</a></main></body></html>`, { status: 503, headers: { ...headers, "Content-Type": "text/html; charset=utf-8" } });
    }
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
