type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export async function isGoogleAuthEnabled(configuration: { url: string; anonKey: string }, fetcher: FetchLike = fetch) {
  try {
    const response = await fetcher(`${configuration.url}/auth/v1/settings`, {
      headers: { apikey: configuration.anonKey, "X-Client-Info": "mata-beauty-oauth-check" },
      cache: "no-store",
    });
    if (!response.ok) return false;
    const payload = await response.json() as { external?: { google?: boolean } };
    return payload.external?.google === true;
  } catch {
    return false;
  }
}
