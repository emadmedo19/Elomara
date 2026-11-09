import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { storageClient } from './storage-client.mjs';

const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!key) throw new Error('Missing source storage credential');
const source = 'https://yvoylicirtdarroqcxoq.supabase.co/storage/v1';
const headers = { apikey: key, Authorization: `Bearer ${key}` };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function sourceRequest(path, options = {}) {
  const response = await fetch(source + path, { ...options, headers: { ...headers, ...options.headers }, signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`Source storage read failed (HTTP ${response.status}); no data removed`);
  return response;
}
const { client, endpoint } = await storageClient();
try {
  for (const [bucket, expectedPublic] of [['bunyan-ota', true], ['elomara-android-signing', false]]) {
    const info = await (await sourceRequest('/bucket/' + bucket)).json();
    if (info.public !== expectedPublic) throw new Error('Source bucket privacy mismatch');
    const paths = [];
    async function list(prefix = '') {
      for (let offset = 0; ; offset += 100) {
        const page = await (await sourceRequest('/object/list/' + bucket, { method: 'POST',
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefix, limit: 100, offset, sortBy: { column: 'name', order: 'asc' } }) })).json();
        for (const item of page) {
          const name = prefix ? prefix + '/' + item.name : item.name;
          if (item.id === null) await list(name); else paths.push(name);
        }
        if (page.length < 100) break;
      }
    }
    await list();
    if (bucket === 'elomara-android-signing' && !paths.includes('signing-v1.json')) throw new Error('Existing signing identity is missing; refusing replacement');
    for (const name of paths) {
      const path = name.split('/').map(encodeURIComponent).join('/');
      const response = await sourceRequest(`/object/authenticated/${bucket}/${path}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      let existing;
      try { existing = await client.send(new GetObjectCommand({ Bucket: bucket, Key: name })); }
      catch (error) { if (error?.$metadata?.httpStatusCode !== 404) throw new Error('Cannot check destination object'); }
      if (existing?.Body) {
        const restored = await existing.Body.transformToByteArray();
        // Never replace a destination manifest published after the initial copy.
        if (bucket === 'bunyan-ota' && name === 'latest.json') continue;
        if (hash(restored) !== hash(bytes)) throw new Error('Existing destination object differs; refusing overwrite');
        continue;
      }
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: name, Body: bytes,
        ContentType: response.headers.get('content-type') || 'application/octet-stream',
        CacheControl: !expectedPublic ? 'private,no-store' : name === 'latest.json' ? 'no-cache' : 'public,max-age=31536000,immutable' }));
      const restored = await client.send(new GetObjectCommand({ Bucket: bucket, Key: name }));
      if (!restored.Body || hash(await restored.Body.transformToByteArray()) !== hash(bytes)) throw new Error('Storage byte verification failed');
    }
    console.log(`PASS: copied and verified ${paths.length} objects from ${bucket}; source untouched`);
  }
  await writeFile('neon-storage-runtime.json', JSON.stringify({ otaBaseUrl: `${endpoint}/bunyan-ota` }));
} finally { client.destroy(); }
