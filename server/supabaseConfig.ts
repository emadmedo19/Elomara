export function resolveSupabaseConfig(url: string | undefined, key: string | undefined) {
  if (!url?.trim() || !key?.trim()) {
    throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be configured.');
  }
  const parsed = new URL(url.trim());
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error('Invalid Supabase URL.');
  }
  const publicKey = key.trim();
  if (publicKey.startsWith('sb_secret_')) throw new Error('Use a Supabase publishable key, never a secret key.');
  if (!publicKey.startsWith('sb_publishable_')) {
    try {
      const payload = JSON.parse(atob(publicKey.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (payload.role !== 'anon') throw new Error();
    } catch {
      throw new Error('Use a Supabase publishable or legacy anon key.');
    }
  }
  return { url: parsed.origin, key: publicKey };
}
