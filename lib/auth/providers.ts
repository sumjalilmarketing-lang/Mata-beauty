type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export async function isGoogleAuthEnabled(fetcher: FetchLike = fetch) {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetcher("/api/auth/providers", { cache: "no-store", signal: controller.signal });
    if (!response.ok) return false;
    const payload = await response.json() as { google?: boolean };
    return payload.google === true;
  } catch {
    return false;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}
