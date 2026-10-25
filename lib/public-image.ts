const siteOrigin = "https://mata-beauty.com";

export function publicMetadataImage(value: string | null | undefined) {
  if (!value) return `${siteOrigin}/og.png`;
  try {
    const image = new URL(value, siteOrigin);
    if (image.protocol !== "https:") return `${siteOrigin}/og.png`;
    const sensitiveParameters = new Set(["token", "signature", "sig", "jwt", "expires", "x-amz-signature"]);
    if ([...image.searchParams.keys()].some(key => sensitiveParameters.has(key.toLowerCase()))) return `${siteOrigin}/og.png`;
    const onSite = image.origin === siteOrigin;
    const publicSupabaseStorage = image.hostname.endsWith(".supabase.co") && image.pathname.includes("/storage/v1/object/public/");
    if (!onSite && !publicSupabaseStorage) return `${siteOrigin}/og.png`;
    return image.toString();
  } catch {
    return `${siteOrigin}/og.png`;
  }
}
