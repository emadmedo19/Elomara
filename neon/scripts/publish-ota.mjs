import { readFile } from 'node:fs/promises';
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { createHash } from 'node:crypto';
import { storageClient } from './storage-client.mjs';

const sha = process.env.GITHUB_SHA;
if (!/^[a-f0-9]{40}$/.test(sha || '')) throw new Error('Invalid release SHA');
const { client, endpoint } = await storageClient();
const bucket = 'bunyan-ota';
const bundle = await readFile(`ota-upload/${sha}.zip`);
const checksum = createHash('sha256').update(bundle).digest('hex');
const manifest = Buffer.from(JSON.stringify({
  bundleId: sha,
  url: `${endpoint}/${bucket}/bundles/${sha}.zip`,
  checksum,
}));
try {
  const put = async (key, body, contentType, cacheControl) => {
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body,
      ContentType: contentType, CacheControl: cacheControl }));
    const saved = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!saved.Body || createHash('sha256').update(await saved.Body.transformToByteArray()).digest('hex')
      !== createHash('sha256').update(body).digest('hex')) throw new Error(`OTA verification failed for ${key}`);
  };
  await put(`bundles/${sha}.zip`, bundle, 'application/zip', 'public,max-age=31536000,immutable');
  // The manifest is published last: clients never see a reference to a missing bundle.
  await put('latest.json', manifest, 'application/json', 'no-cache');
  console.log(`Verified Neon OTA publication: ${sha}`);
} finally { client.destroy(); }
