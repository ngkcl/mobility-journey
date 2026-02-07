import { createClient, SupabaseClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

let _client: SupabaseClient | null = null;
let _configured = false;

export function isSupabaseConfigured(): boolean {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  return !!(url && key && !url.includes('your-project') && !key.includes('your-'));
}

export function getSupabase(): SupabaseClient {
  if (!_client) {
    const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
    const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
    _configured = isSupabaseConfigured();
    _client = createClient(url || 'https://placeholder.supabase.co', key || 'placeholder', {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  }
  return _client;
}

export function isConfigured(): boolean {
  return _configured;
}
