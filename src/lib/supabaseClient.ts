import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { publicEnv } from './env/public';

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!_client) {
    _client = createClient(
      publicEnv.NEXT_PUBLIC_SUPABASE_URL,
      publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    );
  }
  return _client;
}
