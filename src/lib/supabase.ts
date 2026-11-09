import { createClient } from '@supabase/supabase-js';

import { resolveSupabaseConfig } from '../../server/supabaseConfig';

const { url: supabaseUrl, key: supabaseAnonKey } = resolveSupabaseConfig(
  import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY,
);

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
