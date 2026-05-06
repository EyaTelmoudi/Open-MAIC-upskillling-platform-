import 'server-only';

import { Client as MinioClient } from 'minio';
import { getEnvValue } from './shared-env';

let client: MinioClient | null = null;
const ensuredBuckets = new Set<string>();

function env(name: string): string | undefined {
  return getEnvValue(name);
}

function requiredEnv(name: string): string {
  const value = env(name);
  if (!value) {
    throw new Error(`${name} is required for OpenMAIC object storage.`);
  }
  return value;
}

export function getOpenMAICAssetsBucket(): string {
  return env('OPENMAIC_MINIO_BUCKET') || env('MINIO_BUCKET_OPENMAIC') || 'openmaic-assets';
}

function resolveEndpoint(): { endPoint: string; port?: number } {
  const raw = env('OPENMAIC_MINIO_ENDPOINT') || env('MINIO_ENDPOINT_LOCAL') || env('MINIO_ENDPOINT');
  if (!raw) {
    throw new Error('OPENMAIC_MINIO_ENDPOINT or MINIO_ENDPOINT is required for OpenMAIC object storage.');
  }

  const normalized = raw.replace(/^https?:\/\//, '');
  const [host, portPart] = normalized.split(':', 2);
  const fallbackHost =
    !env('OPENMAIC_MINIO_ENDPOINT') && !env('MINIO_ENDPOINT_LOCAL') && host === 'minio'
      ? 'localhost'
      : host;
  return {
    endPoint: fallbackHost,
    port: portPart ? Number(portPart) : undefined,
  };
}

export function getOpenMAICMinioClient(): MinioClient {
  if (!client) {
    const endpoint = resolveEndpoint();
    client = new MinioClient({
      endPoint: endpoint.endPoint,
      port: endpoint.port || Number(env('OPENMAIC_MINIO_PORT') || 9000),
      useSSL: (
        env('OPENMAIC_MINIO_USE_SSL') ||
        env('MINIO_SECURE') ||
        'false'
      ).toLowerCase() === 'true',
      accessKey: env('OPENMAIC_MINIO_ACCESS_KEY') || requiredEnv('MINIO_ACCESS_KEY'),
      secretKey: env('OPENMAIC_MINIO_SECRET_KEY') || requiredEnv('MINIO_SECRET_KEY'),
    });
  }

  return client;
}

async function ensureBucket(bucket: string): Promise<void> {
  if (ensuredBuckets.has(bucket)) return;

  const minio = getOpenMAICMinioClient();
  const exists = await minio.bucketExists(bucket);
  if (!exists) {
    await minio.makeBucket(bucket);
  }
  ensuredBuckets.add(bucket);
}

export async function putObject(
  objectKey: string,
  body: Buffer,
  meta?: Record<string, string>,
): Promise<void> {
  const bucket = getOpenMAICAssetsBucket();
  await ensureBucket(bucket);
  await getOpenMAICMinioClient().putObject(bucket, objectKey, body, body.length, meta);
}

export async function getObject(objectKey: string) {
  const bucket = getOpenMAICAssetsBucket();
  await ensureBucket(bucket);
  return getOpenMAICMinioClient().getObject(bucket, objectKey);
}

export async function statObject(objectKey: string) {
  const bucket = getOpenMAICAssetsBucket();
  await ensureBucket(bucket);
  return getOpenMAICMinioClient().statObject(bucket, objectKey);
}

export async function removeObject(objectKey: string): Promise<void> {
  const bucket = getOpenMAICAssetsBucket();
  await ensureBucket(bucket);
  await getOpenMAICMinioClient().removeObject(bucket, objectKey).catch(() => undefined);
}

export async function removePrefix(prefix: string): Promise<void> {
  const bucket = getOpenMAICAssetsBucket();
  await ensureBucket(bucket);

  const minio = getOpenMAICMinioClient();
  const objects = minio.listObjectsV2(bucket, prefix, true);
  const keys: string[] = [];

  await new Promise<void>((resolve, reject) => {
    objects.on('data', (item) => {
      if (item.name) {
        keys.push(item.name);
      }
    });
    objects.on('error', reject);
    objects.on('end', () => resolve());
  });

  if (keys.length > 0) {
    await minio.removeObjects(bucket, keys);
  }
}
