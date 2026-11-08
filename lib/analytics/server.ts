import { createHmac } from "node:crypto";
import { isIP } from "node:net";

// Vercel overwrites this header at its trusted ingress. Never accept the general
// x-forwarded-for header, or caller-chosen IPs on a different hosting platform.
export function anonymousAnalyticsKey(request: Request): string | null {
  const secret = process.env.ANALYTICS_SECURITY_PEPPER ?? process.env.PAYMENT_SECURITY_PEPPER;
  const ip = request.headers.get("x-vercel-forwarded-for")?.trim();
  if (process.env.VERCEL !== "1" || !secret || secret.length < 32 || !ip || !isIP(ip)) return null;
  // Group IPv6 privacy addresses by /64; rotating a device address does not reset quota.
  const identity = isIP(ip) === 6 ? ipv6Network(ip) : ip;
  return createHmac("sha256", secret).update(`product-event:${identity}`).digest("hex");
}

function ipv6Network(ip: string): string {
  // URL canonicalizes equivalent IPv6 spellings, including embedded IPv4 tails.
  const canonical = new URL(`http://[${ip}]/`).hostname.slice(1, -1);
  const [left, right] = canonical.split("::");
  const prefix = left ? left.split(":") : [];
  const suffix = right ? right.split(":") : [];
  const words = right === undefined ? prefix : [...prefix, ...Array<string>(8 - prefix.length - suffix.length).fill("0"), ...suffix];
  return `${words.slice(0, 4).map(word => word.padStart(4, "0")).join(":")}::/64`;
}
