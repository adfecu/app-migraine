/**
 * Wraps fetch so a request with no response fails after `timeoutMs`.
 * supabase-js has no timeout of its own: on a stalled connection a save
 * would otherwise stay pending forever and the UI would never show an error.
 */
export function createFetchWithTimeout(
  timeoutMs: number,
  baseFetch: typeof fetch = (input, init) => fetch(input, init),
): typeof fetch {
  return (input, init) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    // Keep honouring an abort requested by the caller.
    const callerSignal = init?.signal;
    if (callerSignal) {
      if (callerSignal.aborted) controller.abort();
      else callerSignal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    return baseFetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
  };
}
