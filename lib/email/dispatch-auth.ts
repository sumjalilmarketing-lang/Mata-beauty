import { createHmac, timingSafeEqual } from "node:crypto";

export function validDispatchRequest(headers: Headers, secret: string | undefined, now = Date.now()): boolean {
  if (!secret) return false;
  const timestamp = headers.get("x-mata-dispatch-time") ?? "";
  const signature = headers.get("x-mata-dispatch-signature") ?? "";
  if (!/^\d{10}$/.test(timestamp) || !/^[a-f0-9]{64}$/.test(signature) || Math.abs(now / 1000 - Number(timestamp)) > 90) return false;
  const expected = createHmac("sha256", secret).update(`mata-notifications:${timestamp}`).digest();
  return timingSafeEqual(Buffer.from(signature, "hex"), expected);
}
