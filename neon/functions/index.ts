import { parseTriggerDelivery } from '@neon/functions/triggers';
import { createBackendClient } from './database.mjs';
import { mobileCallback } from './mobile-callback.mjs';
import announcement from './handlers/send-announcement-push';
import poll from './handlers/send-poll-push';
import exceptional from './handlers/send-exceptional-collection-push';
import overdue from './handlers/send-overdue-alerts';
import deliver from './handlers/deliver-mobile-notifications';
import geminiChat from './handlers/gemini-chat';

const handlers: Record<string, (request: Request) => Promise<Response>> = {
  'send-announcement-push': announcement, 'send-poll-push': poll,
  'send-exceptional-collection-push': exceptional, 'gemini-chat': geminiChat,
};
const schedules: Record<string, { name: string; handler: (request: Request) => Promise<Response> }> = {
  // Side-effect-free probe for verifying that the platform strips forged headers.
  '/cron/probe': { name: 'elomara-probe', handler: async () => Response.json({ ok: true }) },
  '/cron/overdue': { name: 'elomara-overdue', handler: overdue },
  '/cron/mobile': { name: 'elomara-mobile', handler: deliver },
  '/cron/engagement': { name: 'elomara-engagement', handler: async () => {
    const result = await createBackendClient().rpc('schedule_daily_engagement');
    return Response.json({ ok: !result.error }, { status: result.error ? 503 : 200 });
  } },
};
export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/health') return Response.json({ ok: true, service: 'elomara' });
    if (url.pathname === '/auth/callback' && request.method === 'GET') return mobileCallback(request);
    const origin = request.headers.get('origin');
    const cors = { 'Access-Control-Allow-Origin': 'https://localhost', 'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info', 'Vary': 'Origin' };
    if (origin && origin !== 'https://localhost') return new Response('Forbidden origin', { status: 403 });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    try {
      let response: Response;
      if (schedules[url.pathname]) {
        const parsed = await parseTriggerDelivery(request);
        const route = schedules[url.pathname];
        if (!parsed.ok || parsed.invocation.type !== 'schedule' || parsed.invocation.trigger.name !== route.name) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }
        response = await route.handler(request);
      } else {
        const handler = handlers[url.pathname.replace(/^\/functions\/v1\//, '')];
        if (!handler) return Response.json({ error: 'Not found' }, { status: 404 });
        response = await handler(request);
      }
      const headers = new Headers(response.headers);
      for (const [key, value] of Object.entries(cors)) headers.set(key, value);
      return new Response(response.body, { status: response.status, headers });
    } catch {
      return Response.json({ error: 'Service temporarily unavailable' }, { status: 503, headers: cors });
    }
  },
};
