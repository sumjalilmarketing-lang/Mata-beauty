export const dynamic = "force-dynamic";
export function GET() {
  return Response.json({ version: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? "local" }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
