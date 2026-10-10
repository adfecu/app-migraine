const LOCAL_HOST = /^https?:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2|192\.168\.\d+\.\d+)(:\d+)?(\/|$)/i;

/** True for Supabase URLs that only work on the developer's machine or network. */
export function isLocalSupabaseUrl(url: string): boolean {
  return LOCAL_HOST.test(url.trim());
}

/**
 * Stops a build whose Supabase settings cannot work, with a message that says why:
 * - no URL or anon key was bundled (EXPO_PUBLIC_* missing when the bundle was made);
 * - a release build points at a local server, meaning a development .env file
 *   leaked into it.
 * Failing at launch makes the misconfiguration obvious before the build reaches users.
 */
export function assertSupabaseConfig(url: string, anonKey: string, isDevBuild: boolean): void {
  if (!url.trim() || !anonKey.trim()) {
    throw new Error(
      'This build has no Supabase configuration (EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY). ' +
        'Set them for the EAS environment, or in .env.development.local for local development, and rebuild.',
    );
  }
  if (!isDevBuild && isLocalSupabaseUrl(url)) {
    throw new Error(
      `This release build points at a local Supabase server (${url}). ` +
        'Remove local overrides (.env.development.local) from the release environment and rebuild.',
    );
  }
}
