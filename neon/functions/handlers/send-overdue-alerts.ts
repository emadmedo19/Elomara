import { createBackendClient } from '../database.mjs';

export default async function scheduleCollectionReminders(): Promise<Response> {
  const { data, error } = await createBackendClient().rpc('schedule_collection_reminders');
  if (error) {
    console.error('Collection reminder scheduling failed');
    return Response.json({ ok: false }, { status: 503 });
  }
  return Response.json({ ok: true, queued: data?.[0]?.schedule_collection_reminders ?? 0 });
}
