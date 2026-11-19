import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const triggers = JSON.parse(readFileSync(new URL('../triggers.json', import.meta.url), 'utf8'));
const mobile = triggers.find(trigger => trigger.name === 'elomara-mobile');
const engagement = triggers.find(trigger => trigger.name === 'elomara-engagement');

test('mobile notification polling remains enabled every minute', () => {
  assert.equal(mobile?.enabled, true);
  assert.equal(mobile?.cron, '* * * * *');
});

test('engagement schedule covers exactly three Cairo windows in both seasons', () => {
  assert.equal(engagement?.enabled, true);
  assert.equal(engagement?.cron, '2,7 7,8,13,14,17,18 * * *');
  const cairo = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  });
  for (const day of ['2026-01-20', '2026-07-20']) {
    const matches = [];
    for (const hour of [7, 8, 13, 14, 17, 18]) {
      for (const minute of [2, 7]) {
        const instant = new Date(`${day}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`);
        const parts = Object.fromEntries(cairo.formatToParts(instant).map(part => [part.type, part.value]));
        if ([10, 16, 20].includes(Number(parts.hour))) matches.push(`${parts.hour}:${parts.minute}`);
      }
    }
    assert.deepEqual(matches, ['10:02', '10:07', '16:02', '16:07', '20:02', '20:07']);
  }
});

test('mobile queue check skips OAuth when there are no pending messages', () => {
  const source = readFileSync(new URL('../functions/handlers/deliver-mobile-notifications.ts', import.meta.url), 'utf8');
  const peek = source.indexOf('admin.from("notification_deliveries")');
  const earlyExit = source.indexOf('if (!pending?.length) return json({claimed:0,sent:0,failed:0});');
  const oauth = source.indexOf('const access=await firebaseAccessToken(service);');
  const claim = source.indexOf('admin.rpc("claim_mobile_notifications"');
  assert.ok(peek >= 0 && peek < earlyExit && earlyExit < oauth && oauth < claim,
    'empty queue must not request an OAuth token; auth must precede leasing');
});
