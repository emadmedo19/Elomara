import { writeFile, mkdir } from 'node:fs/promises';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { join } from 'node:path';
import { storageClient } from './storage-client.mjs';

const directory = process.env.SIGNING_WORKDIR;
if (!directory) throw new Error('SIGNING_WORKDIR is required');
const { client } = await storageClient();
try {
  const result = await client.send(new GetObjectCommand({ Bucket: 'elomara-android-signing', Key: 'signing-v1.json' }));
  if (!result.Body) throw new Error('The original signing identity is unavailable');
  const bytes = await result.Body.transformToByteArray();
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const file = join(directory, 'original-signing-bundle.json');
  await writeFile(file, bytes, { mode: 0o600 });
  await writeFile(process.env.GITHUB_ENV, `NEON_SIGNING_BUNDLE_FILE=${file}\n`, { flag: 'a' });
  console.log('Original private signing identity restored from Neon (contents omitted)');
} finally { client.destroy(); }
