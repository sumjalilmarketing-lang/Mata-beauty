import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createSupabaseServerClient(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("Configuration Supabase publique absente.");
  const cookieStore = await cookies();
  const secure = new URL(request.url).protocol === "https:";
  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (values) => {
        for (const { name, value, options } of values) {
          cookieStore.set(name, value, { ...options, path: "/", sameSite: "lax", secure });
        }
      },
    },
  });
}
