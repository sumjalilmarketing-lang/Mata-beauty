/** Reject ambiguous path separators and control characters before routing/auth. */
export function isMalformedRequestPath(pathname: string): boolean {
  let decoded: string;
  try { decoded = decodeURIComponent(pathname); } catch { return true; }
  return /[\\\u0000-\u001f\u007f]/.test(decoded)
    || /%(?:5c|0[0-9a-f]|1[0-9a-f]|7f)/i.test(decoded);
}
