type StorageKind = "localStorage" | "sessionStorage";

export function readBrowserStorage(kind: StorageKind, key: string): string | null {
  try { return typeof window === "undefined" ? null : window[kind].getItem(key); }
  catch { return null; }
}

export function writeBrowserStorage(kind: StorageKind, key: string, value: string): boolean {
  try {
    if (typeof window === "undefined") return false;
    window[kind].setItem(key, value);
    return true;
  } catch { return false; }
}

export function removeBrowserStorage(kind: StorageKind, key: string): void {
  try { if (typeof window !== "undefined") window[kind].removeItem(key); }
  catch { /* Optional browser preferences must not interrupt the application. */ }
}
