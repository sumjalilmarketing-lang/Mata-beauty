export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ addressSearchEnabled: Boolean(process.env.GOOGLE_MAPS_SERVER_KEY), manualAddressEnabled: true }, {
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}
