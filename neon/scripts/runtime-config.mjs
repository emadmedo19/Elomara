import { spawnSync } from 'node:child_process';
import { appendFile } from 'node:fs/promises';
import { storageClient } from './storage-client.mjs';

const result = spawnSync('neon/node_modules/.bin/neon', ['functions', 'get', 'elomara', '--project-id',
  'misty-glitter-45861249', '--branch', 'br-ancient-thunder-be36ds8e', '--output', 'json'], { encoding: 'utf8' });
if (result.status !== 0) throw new Error('Cannot resolve deployed Neon backend; output omitted');
const data = JSON.parse(result.stdout);
const base = (data.function || data).invocation_url;
if (typeof base !== 'string' || !base.startsWith('https://')) throw new Error('No HTTPS backend URL');
const { client, endpoint } = await storageClient();
client.destroy();
await appendFile(process.env.GITHUB_ENV, `VITE_BACKEND_PROVIDER=neon\nVITE_NEON_CANDIDATE=true\nVITE_NEON_FUNCTIONS_URL=${new URL(base).origin}\nVITE_OTA_BASE_URL=${endpoint}/bunyan-ota\n`);
console.log('Neon Android candidate endpoints configured (no credentials included in the app)');
