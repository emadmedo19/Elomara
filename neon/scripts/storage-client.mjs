import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { S3Client } from '@aws-sdk/client-s3';

export async function storageClient() {
  const directory = await mkdtemp(join(tmpdir(), 'elomara-neon-storage-'));
  try {
    const file = join(directory, '.env');
    const result = spawnSync('neon/node_modules/.bin/neon', ['env', 'pull', '--project-id', 'misty-glitter-45861249',
      '--branch', 'br-ancient-thunder-be36ds8e', '--service', 'object-storage', '--file', file], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error('Could not provision scoped Neon storage credentials; CLI output omitted');
    await chmod(file, 0o600);
    const env = parseEnv(await readFile(file, 'utf8'));
    for (const name of ['AWS_ENDPOINT_URL_S3', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION']) {
      if (!env[name]) throw new Error(`Neon storage variable missing: ${name}`);
    }
    return { endpoint: env.AWS_ENDPOINT_URL_S3.replace(/\/+$/, ''), client: new S3Client({ forcePathStyle: true,
      endpoint: env.AWS_ENDPOINT_URL_S3, region: env.AWS_REGION,
      credentials: { accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY } }) };
  } finally { await rm(directory, { recursive: true, force: true }); }
}
