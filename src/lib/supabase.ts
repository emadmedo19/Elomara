import { createClient } from '@supabase/supabase-js';

const DEFAULT_URL = 'https://yvoylicirtdarroqcxoq.supabase.co';
const DEFAULT_KEY = 'sb_publishable_HKL0bzKI5Lf0M7v4YDXNcw_DIz9CAre';

function resolveSupabaseConfig() {
  let url = (import.meta.env.VITE_SUPABASE_URL || '').trim();
  let key = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

  // If VITE_SUPABASE_URL was misconfigured with a JWT or key instead of an HTTP/HTTPS URL
  if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
    try {
      const parts = url.split('.');
      if (parts.length === 3) {
        // Base64 decode JWT payload to extract project reference
        const decoded = atob(parts[1]);
        const payload = JSON.parse(decoded);
        if (payload.ref) {
          // url was actually the JWT token; if key was missing or secret, use url as anon key
          if (!key || key.startsWith('sb_secret_')) {
            key = url;
          }
          url = `https://${payload.ref}.supabase.co`;
        }
      }
    } catch {
      url = DEFAULT_URL;
    }
  }

  // Final URL validation check
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      url = DEFAULT_URL;
    }
  } catch {
    url = DEFAULT_URL;
  }

  if (!key) {
    key = DEFAULT_KEY;
  }

  return { url, key };
}

const { url: supabaseUrl, key: supabaseAnonKey } = resolveSupabaseConfig();

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
