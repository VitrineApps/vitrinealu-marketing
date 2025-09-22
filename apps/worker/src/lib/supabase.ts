import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config.js';

let client: SupabaseClient | null = null;

export const getSupabase = (): SupabaseClient => {
  if (client) {
    return client;
  }
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY;
  if (!env.SUPABASE_URL || !key) {
    throw new Error('Supabase credentials are not configured');
  }
  client = createClient(env.SUPABASE_URL, key, {
    auth: { persistSession: false }
  });
  return client;
};
