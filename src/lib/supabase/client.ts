import { createBrowserClient } from "@supabase/ssr";

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

export function createClient(): any {
  const config = getSupabaseConfig();

  if (!config) {
    return createFallbackClient() as any;
  }

  return createBrowserClient(config.url, config.key) as any;
}
