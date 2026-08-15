import { paymentCapabilities } from "@/lib/payments/gateway";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(paymentCapabilities(), {
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
