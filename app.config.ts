import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { config as loadDotenv } from 'dotenv';
import type { ExpoConfig } from 'expo/config';

// EAS CLI reads this config on your machine before uploading; the dashboard env applies on the
// worker. Values in .env / .env.local (gitignored) are picked up here when present.
for (const name of ['.env', '.env.local'] as const) {
  const envPath = resolve(process.cwd(), name);
  if (existsSync(envPath)) {
    loadDotenv({ path: envPath, override: false });
  }
}

function checkSupabaseEnv(): void {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ?? '';
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? '';
  if (url && key) return;

  const message =
    'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. ' +
    'Set both in expo.dev → Project → Environment variables for each EAS environment; ' +
    'for local development use a gitignored .env.development.local.';

  // EAS build workers bundle the app, so a missing value there must fail the build.
  // Locally, commands such as `eas env:list` or `eas build` only read this config,
  // and a bundle made without the values refuses to start (utils/supabaseConfig.ts).
  if (process.env.EAS_BUILD === 'true') {
    throw new Error(message);
  }
  console.warn(`Warning: ${message}`);
}

/**
 * Dynamic layer over app.json: fails EAS builds when Supabase public env is
 * missing, so TestFlight never gets a bundle with empty URLs.
 */
export default ({ config }: { config: ExpoConfig }): ExpoConfig => {
  checkSupabaseEnv();
  return config;
};
