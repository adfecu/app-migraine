import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { config as loadDotenv } from 'dotenv';
import type { ExpoConfig } from 'expo/config';

// Local `eas build` runs `npx expo config` before upload; dashboard env applies on the worker.
// Loading .env here ensures EXPO_PUBLIC_* exist for that step when you keep secrets in .env (gitignored).
for (const name of ['.env', '.env.local'] as const) {
  const envPath = resolve(process.cwd(), name);
  if (existsSync(envPath)) {
    loadDotenv({ path: envPath, override: false });
  }
}

function assertSupabaseEnv(): void {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ?? '';
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? '';
  if (!url || !key) {
    throw new Error(
      'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. ' +
        'Use a gitignored .env (or .env.local) in the project root for local commands including `eas build` (Expo reads app.config before the cloud worker). ' +
        'For EAS, also set both in expo.dev → Project → Environment variables so release builds receive them on the builder.'
    );
  }
}

/**
 * Dynamic layer over app.json: fails EAS/local configure when Supabase
 * public env is missing, so TestFlight never gets a bundle with empty URLs.
 */
export default ({ config }: { config: ExpoConfig }): ExpoConfig => {
  assertSupabaseEnv();
  return config;
};
