const LOCAL_HOST = /^https?:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2|192\.168\.\d+\.\d+)(:\d+)?(\/|$)/i;

/** True for Supabase URLs that only work on the developer's machine or network. */
export function isLocalSupabaseUrl(url: string): boolean {
  return LOCAL_HOST.test(url.trim());
}

/**
 * Stops a release build that was bundled with a local Supabase URL, which
 * means a development .env file leaked into it. Failing at launch makes the
 * misconfiguration obvious before the build reaches users.
 */
export function assertReleaseSupabaseUrl(url: string, isDevBuild: boolean): void {
  if (!isDevBuild && isLocalSupabaseUrl(url)) {
    throw new Error(
      `This release build points at a local Supabase server (${url}). ` +
        'Remove local overrides (.env.development.local) from the release environment and rebuild.',
    );
  }
}
