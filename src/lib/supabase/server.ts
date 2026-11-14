import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key || url.includes("YOUR_PROJECT") || key.includes("YOUR_")) {
    return null;
  }

  return { url, key };
}

function createFallbackQueryBuilder() {
  return {
    select: () => createFallbackQueryBuilder(),
    eq: () => createFallbackQueryBuilder(),
    order: async () => ({ data: [], error: null }),
    single: async () => ({ data: null, error: null }),
    insert: async () => ({ data: null, error: null }),
    update: async () => ({ data: null, error: null })
  };
}

function createFallbackClient() {
  return {
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
      signInWithOtp: async () => ({ data: { user: null }, error: null }),
      signOut: async () => ({ error: null }),
      exchangeCodeForSession: async () => ({ data: { session: null }, error: null })
    },
    from: () => createFallbackQueryBuilder(),
    rpc: async () => ({ data: null, error: null })
  };
}

export async function createClient(): Promise<any> {
  const config = getSupabaseConfig();

  if (!config) {
    return createFallbackClient() as any;
  }

  const cookieStore = await cookies();
  return createServerClient(config.url, config.key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options as any));
        } catch {}
      }
    }
  }) as any;
}
