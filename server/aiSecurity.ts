import type { RequestHandler } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';

// Fixed windows, bounded memory, and a process-wide ceiling. Multi-instance deployments
// must additionally enforce a shared quota at the gateway (see README).
export function createQuota(limit: number, windowMs: number, maxKeys = 10000, now = Date.now) {
  const buckets = new Map<string, { count: number; until: number }>();
  return (key: string) => {
    const time = now();
    for (const [id, bucket] of buckets) if (bucket.until <= time) buckets.delete(id);
    const bucket = buckets.get(key);
    if (bucket) {
      if (bucket.count >= limit) return false;
      bucket.count++;
    } else {
      if (buckets.size >= maxKeys) return false;
      buckets.set(key, { count: 1, until: time + windowMs });
    }
    return true;
  };
}

export function aiSecurity(client: SupabaseClient, allowedOrigins: string[]): RequestHandler[] {
  const incoming = createQuota(60, 60000);
  const users = createQuota(20, 60000);
  const daily = createQuota(1000, 86400000, 1);
  return [
    (req, res, next) => {
      const origin = req.get('Origin');
      res.vary('Origin');
      if (origin && !allowedOrigins.includes(origin)) {
        return void res.status(403).json({ error: 'Origin not allowed.' });
      }
      if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      if (req.method === 'OPTIONS') return void res.sendStatus(204);
      // Do not trust caller-controlled X-Forwarded-For headers.
      if (!incoming(req.ip || 'unknown')) {
        res.setHeader('Retry-After', '60');
        return void res.status(429).json({ error: 'Too many requests.' });
      }
      next();
    },
    async (req, res, next) => {
      const match = /^Bearer (\S+)$/i.exec(req.get('Authorization') || '');
      if (!match) return void res.status(401).json({ error: 'Authentication required.' });
      try {
        const { data, error } = await client.auth.getUser(match[1]);
        if (error || !data.user) return void res.status(401).json({ error: 'Invalid session.' });
        // Use the user's JWT for RLS; never a service-role client.
        const { data: profile, error: profileError } = await client.from('profiles')
          .select('approved,disabled_at,building_id,role').eq('id', data.user.id)
          .setHeader('Authorization', `Bearer ${match[1]}`).maybeSingle();
        if (profileError) return void res.status(503).json({ error: 'Unable to verify account access.' });
        if (!profile?.approved || profile.disabled_at || !profile.building_id ||
            !['building_admin', 'owner', 'tenant'].includes(profile.role)) {
          return void res.status(403).json({ error: 'An active approved building account is required.' });
        }
        if (!users(data.user.id) || !daily('all')) {
          res.setHeader('Retry-After', '60');
          return void res.status(429).json({ error: 'AI usage limit reached.' });
        }
        next();
      } catch {
        res.status(503).json({ error: 'Unable to verify authentication.' });
      }
    },
  ];
}
