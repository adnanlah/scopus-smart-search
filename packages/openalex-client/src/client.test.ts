import { describe, expect, it, vi } from 'vitest';
import { OpenAlexClient } from './index.js';

const jsonResponse = (body: unknown, headers: Record<string, string> = {}): Response => new Response(JSON.stringify(body), {
  status: 200,
  headers: { 'content-type': 'application/json', ...headers },
});

describe('OpenAlexClient', () => {
  it('builds a works search capped at 100 results and sends an optional bearer token', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ meta: { count: 0 }, results: [] }));
    const client = new OpenAlexClient({ apiKey: 'secret', baseUrl: 'https://example.test' });
    await client.search('heart attack', 500);
    const [input, init] = fetchMock.mock.calls[0] ?? [];
    const url = new URL(String(input));
    expect(url.pathname).toBe('/works');
    expect(url.searchParams.get('search')).toBe('heart attack');
    expect(url.searchParams.get('per_page')).toBe('100');
    expect(url.searchParams.get('page')).toBe('1');
    expect(url.searchParams.get('select')).toContain('abstract_inverted_index');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer secret');
    fetchMock.mockRestore();
  });

  it('retries a rate-limited request and exposes rate-limit metadata', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('rate limited', { status: 429, headers: { 'retry-after': '0' } }))
      .mockResolvedValueOnce(jsonResponse({ meta: { count: 1 }, results: [{ id: 'https://openalex.org/W1', display_name: 'Recovered work' }] }, {
        'x-ratelimit-limit': '10000',
        'x-ratelimit-remaining': '9999',
        'x-ratelimit-reset': '60',
        'x-ratelimit-credits-used': '1',
      }));
    const client = new OpenAlexClient({ baseUrl: 'https://example.test', maxRetries: 1 });
    const result = await client.search('recovery', 1);
    expect(result.results[0]?.title).toBe('Recovered work');
    expect(result.quota).toMatchObject({ limit: 10000, remaining: 9999, creditsUsed: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fetchMock.mockRestore();
  });
});
