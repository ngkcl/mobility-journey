import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!_client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      throw new Error(
        'Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY',
      );
    }
    _client = createClient(url, key);
  }
  return _client;
}

/**
 * Convenience re-export that is safe to import at module scope.
 * On the server (during static pre-rendering) this evaluates to `null`
 * so that `next build` doesn't crash when env vars are absent.
 * Every runtime call-site that actually needs the client should call
 * `getSupabase()` instead.
 */
export const supabase: SupabaseClient =
  typeof window !== 'undefined'
    ? getSupabase()
    : (null as unknown as SupabaseClient);
