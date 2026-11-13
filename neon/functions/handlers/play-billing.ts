import { createHash } from 'node:crypto';
import { importPKCS8, SignJWT, createRemoteJWKSet, jwtVerify } from 'jose';
import { authenticatedUser, pool } from '../database.mjs';
import { PLAY_PACKAGE, verifiedEntitlement } from '../play-policy.mjs';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const accountId = (id: string) => hash(`elomara:play:admin:${id}`);
const profileId = (id: string) => hash(`elomara:play:building:${id}`);
const headers = { 'Cache-Control': 'no-store' };
let oauth: { token: string; expires: number } | undefined;
async function play(path: string, method = 'GET') {
  if (!oauth || oauth.expires < Date.now() + 60000) {
    const credentials = JSON.parse(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON || '{}');
    if (!credentials.client_email || !credentials.private_key) throw new Error('Play verification is not configured');
    const key = await importPKCS8(credentials.private_key, 'RS256');
    const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/androidpublisher' }).setProtectedHeader({ alg: 'RS256' })
      .setIssuer(credentials.client_email).setAudience('https://oauth2.googleapis.com/token').setIssuedAt().setExpirationTime('5m').sign(key);
    const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }), signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('Play authentication failed');
    const data = await response.json();
    oauth = { token: data.access_token, expires: Date.now() + Number(data.expires_in) * 1000 };
  }
  const response = await fetch(`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PLAY_PACKAGE}/${path}`, {
    method, headers: { Authorization: `Bearer ${oauth.token}`, 'Content-Type': 'application/json' },
    ...(method === 'POST' ? { body: '{}' } : {}), signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error('Google Play verification failed');
  return method === 'POST' || response.status === 204 ? {} : response.json();
}

// Every entry point re-reads Google. Notification payloads and client flags never grant access.
export async function verifyToken(token: string, actor?: { id: string; building: string }, checkRefund = false) {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [hash(token)]);
    const { rows: [known] } = await db.query('SELECT * FROM private.play_purchases WHERE token_hash=$1', [hash(token)]);
    if (!actor && !known) { await db.query('ROLLBACK'); return; }
    const building = actor?.building || known.building_id;
    const user = actor?.id || known.admin_id;
    if (known && (known.building_id !== building || (actor && known.admin_id !== user))) throw new Error('Purchase belongs to another account');
    if (actor) {
      const { rowCount } = await db.query(`SELECT 1 FROM public.profiles WHERE id=$1 AND building_id=$2 AND role='building_admin' AND approved=true AND disabled_at IS NULL FOR SHARE`, [user, building]);
      if (!rowCount) throw new Error('Building administrator required');
    }
    await db.query('SELECT id FROM public.buildings WHERE id=$1 FOR UPDATE', [building]);
    const purchase = await play(`purchases/subscriptionsv2/tokens/${encodeURIComponent(token)}`);
    if (purchase.externalAccountIdentifiers?.obfuscatedExternalAccountId !== accountId(user) || purchase.externalAccountIdentifiers?.obfuscatedExternalProfileId !== profileId(building)) throw new Error('Play account binding mismatch');
    const entitlement = verifiedEntitlement(purchase);
    if (checkRefund) {
      // A Pub/Sub refund is only a hint. Confirm the order against Google's voided purchases API.
      const latestOrder = purchase.lineItems?.[0]?.latestSuccessfulOrderId || purchase.latestOrderId;
      let page = '';
      for (let i = 0; i < 10; i++) {
        const voided = await play(`purchases/voidedpurchases?type=1&maxResults=1000${page ? `&token=${encodeURIComponent(page)}` : ''}`);
        if (voided.voidedPurchases?.some((v: {purchaseToken?:string;orderId?:string}) => v.purchaseToken === token && v.orderId === latestOrder)) {
          entitlement.active = false;
          entitlement.state = 'REFUNDED';
          break;
        }
        page = voided.tokenPagination?.nextPageToken || '';
        if (!page) break;
        if (i === 9) throw new Error('Refund reconciliation requires another attempt');
      }
    }
    if (known?.play_state === 'REFUNDED' && known.last_order_id === (purchase.lineItems?.[0]?.latestSuccessfulOrderId || purchase.latestOrderId)) { entitlement.active = false; entitlement.state = 'REFUNDED'; }
    // Replacement tokens cannot cross buildings or accounts.
    if (purchase.linkedPurchaseToken) {
      const { rows: [linked] } = await db.query('SELECT building_id,admin_id FROM private.play_purchases WHERE token_hash=$1', [hash(purchase.linkedPurchaseToken)]);
      if (linked && (linked.building_id !== building || linked.admin_id !== user)) throw new Error('Replacement binding mismatch');
    }
    if (entitlement.active && purchase.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING') {
      await play(`purchases/subscriptions/${encodeURIComponent(entitlement.product)}/tokens/${encodeURIComponent(token)}:acknowledge`, 'POST');
    }
    await db.query(`INSERT INTO private.play_purchases(token_hash,purchase_token,building_id,admin_id,product_id,base_plan_id,play_state,expires_at,auto_renewing,entitled,verified_at,last_order_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now(),$11) ON CONFLICT(token_hash) DO UPDATE SET play_state=EXCLUDED.play_state,expires_at=EXCLUDED.expires_at,auto_renewing=EXCLUDED.auto_renewing,entitled=EXCLUDED.entitled,verified_at=now(),last_checked_at=now(),last_order_id=EXCLUDED.last_order_id`,
      [hash(token), token, building, user, entitlement.product, entitlement.basePlan, entitlement.state, entitlement.expiresAt, entitlement.autoRenewing, entitlement.active, purchase.lineItems?.[0]?.latestSuccessfulOrderId || purchase.latestOrderId || null]);
    const { rows: [best] } = await db.query(`SELECT product_id,expires_at FROM private.play_purchases WHERE building_id=$1 AND entitled AND expires_at>now() ORDER BY expires_at DESC LIMIT 1`, [building]);
    if (!entitlement.pending) await db.query(`INSERT INTO public.building_subscriptions(building_id,status,plan,paid_through,billing_source)
      VALUES($1,$2,$3,$4,'google_play') ON CONFLICT(building_id) DO UPDATE SET status=EXCLUDED.status,plan=EXCLUDED.plan,paid_through=EXCLUDED.paid_through,billing_source='google_play',updated_at=now()
      WHERE public.building_subscriptions.status<>'vip' AND (EXCLUDED.status='active' OR public.building_subscriptions.billing_source='google_play')`, [building, best ? 'active' : 'expired', best ? (best.product_id.endsWith('monthly') ? 'monthly' : 'annual') : null, best?.expires_at || null]);
    await db.query(`INSERT INTO private.subscription_events(building_id,event_type,metadata) VALUES($1,'google_play_verified',$2)`, [building, JSON.stringify({ token_hash: hash(token), state: entitlement.state })]);
    await db.query('COMMIT');
    return { verified: true, pending: entitlement.pending, state: entitlement.state, expires_at: entitlement.expiresAt, auto_renewing: entitlement.autoRenewing };
  } catch (error) { await db.query('ROLLBACK'); throw error; }
  finally { db.release(); }
}
export default async function handle(request: Request): Promise<Response> {
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers });
  let user: { id: string };
  try { user = await authenticatedUser(request.headers.get('Authorization') || ''); }
  catch { return Response.json({ error: 'Authentication required' }, { status: 401, headers }); }
  try {
    const raw = await request.text();
    if (raw.length > 8192) return Response.json({error:'Request too large'}, {status:413,headers});
    const body = JSON.parse(raw);
    if (typeof body.buildingId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.buildingId)) return Response.json({error:'Invalid building'}, {status:400,headers});
    const { rows: [member] } = await pool.query(`SELECT building_id FROM public.profiles WHERE id=$1 AND role='building_admin' AND approved=true AND disabled_at IS NULL AND building_id=$2`, [user.id, body.buildingId]);
    if (!member) return Response.json({ error: 'Building administrator required' }, { status: 403, headers });
    if (body.action === 'context') return Response.json({ available: process.env.GOOGLE_PLAY_BILLING_ENABLED === 'true' && !!process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON, accountId: accountId(user.id), profileId: profileId(member.building_id) }, { headers });
    if (body.action === 'verify' && typeof body.token === 'string' && body.token.length > 0 && body.token.length < 4096) {
      return Response.json(await verifyToken(body.token, { id: user.id, building: member.building_id }), { headers });
    }
    if (body.action === 'refresh') {
      const { rows } = await pool.query('SELECT purchase_token FROM private.play_purchases WHERE building_id=$1 ORDER BY verified_at LIMIT 20', [member.building_id]);
      for (const row of rows) await verifyToken(row.purchase_token);
      return Response.json({ ok: true }, { headers });
    }
    return Response.json({ error: 'Invalid billing request' }, { status: 400, headers });
  } catch { return Response.json({ error: 'تعذر التحقق من الاشتراك عبر Google Play. حاول مرة أخرى.' }, { status: 503, headers }); }
}
const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
export async function playNotification(request: Request): Promise<Response> {
  try {
    if (request.method !== 'POST' || !process.env.GOOGLE_PLAY_RTDN_AUDIENCE || !process.env.GOOGLE_PLAY_RTDN_EMAIL) throw new Error('Not configured');
    const bearer = request.headers.get('authorization') || '';
    if (!bearer.startsWith('Bearer ')) throw new Error('Unauthorized');
    const { payload } = await jwtVerify(bearer.slice(7), googleKeys, { issuer: ['https://accounts.google.com', 'accounts.google.com'], audience: process.env.GOOGLE_PLAY_RTDN_AUDIENCE, algorithms: ['RS256'] });
    if (payload.email !== process.env.GOOGLE_PLAY_RTDN_EMAIL || payload.email_verified !== true) throw new Error('Unauthorized');
  } catch { return Response.json({ error: 'Unauthorized' }, { status: 401 }); }
  try {
    const body = await request.json();
    const notification = JSON.parse(Buffer.from(body.message.data, 'base64').toString('utf8'));
    if (notification.packageName !== PLAY_PACKAGE) return Response.json({ error: 'Wrong package' }, { status: 400 });
    const token = notification.subscriptionNotification?.purchaseToken || notification.voidedPurchaseNotification?.purchaseToken;
    if (typeof token === 'string' && token.length < 4096) await verifyToken(token, undefined, !!notification.voidedPurchaseNotification);
    return Response.json({ ok: true });
  } catch { return Response.json({ error: 'Verification retry required' }, { status: 503 }); }
}
export async function reconcilePlay(): Promise<Response> {
  const { rows } = await pool.query('SELECT purchase_token FROM private.play_purchases ORDER BY last_checked_at LIMIT 50');
  let failed = 0;
  for (const row of rows) { try { await verifyToken(row.purchase_token); } catch { failed++; await pool.query('UPDATE private.play_purchases SET last_checked_at=now() WHERE token_hash=$1', [hash(row.purchase_token)]); } }
  return Response.json({ ok: failed === 0 }, { status: failed ? 503 : 200 });
}
