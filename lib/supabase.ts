export type AuthSession = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: { id: string; email?: string };
};

function configuration() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Supabase n’est pas configuré. Renseignez les variables NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }
  return { url, anonKey };
}

async function authRequest<T>(path: string, init: RequestInit): Promise<T> {
  const { url, anonKey } = configuration();
  const response = await fetch(`${url}/auth/v1/${path}`, {
    ...init,
    headers: {
      apikey: anonKey,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  const payload = await response.json() as T & { msg?: string; error_description?: string };
  if (!response.ok) {
    throw new Error(payload.error_description || payload.msg || "La requête d’authentification a échoué.");
  }
  return payload;
}

export const supabaseAuth = {
  signUp(email: string, password: string, role: "client" | "provider") {
    return authRequest<AuthSession>("signup", {
      method: "POST",
      body: JSON.stringify({ email, password, data: { role } }),
    });
  },
  signIn(email: string, password: string) {
    return authRequest<AuthSession>("token?grant_type=password", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  },
  resetPassword(email: string) {
    return authRequest<{ message?: string }>("recover", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  },
  signOut(accessToken: string) {
    return authRequest<Record<string, never>>("logout", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  },
};

export function isSupabaseConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
