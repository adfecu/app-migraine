import { createFetchWithTimeout } from '../fetchWithTimeout';

describe('createFetchWithTimeout', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  // A fetch that never responds unless aborted, like a stalled connection.
  const stalledFetch = jest.fn((_input: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    }),
  ) as unknown as typeof fetch;

  it('rejects a request that gets no response within the timeout', async () => {
    const request = createFetchWithTimeout(15_000, stalledFetch)('https://example.test');
    jest.advanceTimersByTime(15_000);
    await expect(request).rejects.toThrow('aborted');
  });

  it('passes through a response that arrives in time', async () => {
    const response = { ok: true } as Response;
    const quickFetch = jest.fn(() => Promise.resolve(response)) as unknown as typeof fetch;
    await expect(createFetchWithTimeout(15_000, quickFetch)('https://example.test')).resolves.toBe(response);
  });

  it('still aborts when the caller aborts', async () => {
    const controller = new AbortController();
    const request = createFetchWithTimeout(15_000, stalledFetch)('https://example.test', { signal: controller.signal });
    controller.abort();
    await expect(request).rejects.toThrow('aborted');
  });
});
