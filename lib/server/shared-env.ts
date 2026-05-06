import 'server-only';

import fs from 'fs';
import path from 'path';

let cachedEnv: Record<string, string> | null = null;

function parseEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {};

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  const out: Record<string, string> = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    out[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
  }

  return out;
}

function loadFallbackEnv(): Record<string, string> {
  if (cachedEnv) return cachedEnv;

  cachedEnv = {
    ...parseEnvFile(path.join(process.cwd(), 'upskilling_platform', '.env')),
    ...parseEnvFile(path.join(process.cwd(), '.env.local')),
  };

  return cachedEnv;
}

export function getEnvValue(name: string): string | undefined {
  const processValue = process.env[name]?.trim();
  if (processValue) return processValue;

  const fallback = loadFallbackEnv()[name]?.trim();
  return fallback || undefined;
}
