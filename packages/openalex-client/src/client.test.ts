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
    await client.search('heart attack', { limit: 10 });
    const [input, init] = fetchMock.mock.calls[0] ?? [];
    const url = new URL(String(input));
    expect(url.pathname).toBe('/works');
    expect(url.searchParams.get('search')).toBe('heart attack');
    expect(url.searchParams.get('per_page')).toBe('10');
    expect(url.searchParams.get('page')).toBe('1');
    expect(url.searchParams.get('filter')).toBe('primary_location.source.is_core:true');
    const selectedFields = url.searchParams.get('select')?.split(',') ?? [];
    expect(selectedFields).toEqual(expect.arrayContaining([
      'abstract_inverted_index',
      'type',
      'language',
      'topics',
      'keywords',
      'indexed_in',
      'is_retracted',
      'cited_by_count',
    ]));
    expect(selectedFields).not.toEqual(expect.arrayContaining([
      'citation_normalized_percentile',
      'cited_by_percentile_year',
      'fwci',
    ]));
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer secret');
    fetchMock.mockRestore();
  });

  it('sends the selected publication year as an OpenAlex date filter', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ meta: { count: 0 }, results: [] }));
    const client = new OpenAlexClient({ baseUrl: 'https://example.test' });

    await client.search('heart attack', { limit: 25, fromPublicationYear: 2022 });

    const [input] = fetchMock.mock.calls[0] ?? [];
    const url = new URL(String(input));
    expect(url.searchParams.get('per_page')).toBe('25');
    expect(url.searchParams.get('filter')).toBe('primary_location.source.is_core:true,from_publication_date:2022-01-01');
    fetchMock.mockRestore();
  });

  it('retrieves up to 1,000 works through sequential 100-result pages', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input));
      const page = Number(url.searchParams.get('page'));
      return jsonResponse({
        meta: { count: 1_250 },
        results: Array.from({ length: 100 }, (_, index) => ({
          id: `https://openalex.org/W${page}-${index}`,
          display_name: `Work ${page}-${index}`,
        })),
      });
    });

    const result = await new OpenAlexClient({ baseUrl: 'https://example.test' }).search('heart attack', { limit: 1_000 });

    expect(fetchMock).toHaveBeenCalledTimes(10);
    const urls = fetchMock.mock.calls.map(([input]) => new URL(String(input)));
    expect(urls.map((url) => url.searchParams.get('page'))).toEqual(
      Array.from({ length: 10 }, (_, index) => String(index + 1)),
    );
    expect(urls.every((url) => url.searchParams.get('per_page') === '100')).toBe(true);
    expect(result.requestedLimit).toBe(1_000);
    expect(result.returnedResults).toBe(1_000);
    expect(result.totalResults).toBe(1_250);
    expect(result.results[0]?.title).toBe('Work 1-0');
    expect(result.results[99]?.rank).toBe(100);
    expect(result.results[100]?.title).toBe('Work 2-0');
    expect(result.results[999]?.rank).toBe(1_000);
    fetchMock.mockRestore();
  });

  it('stops pagination when OpenAlex exhausts the result set', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const page = Number(new URL(String(input)).searchParams.get('page'));
      return jsonResponse({
        meta: { count: 150 },
        results: Array.from({ length: page === 1 ? 100 : 50 }, (_, index) => ({
          id: `https://openalex.org/W${page}-${index}`,
          display_name: `Work ${page}-${index}`,
        })),
      });
    });

    const result = await new OpenAlexClient({ baseUrl: 'https://example.test' }).search('heart attack', { limit: 1_000 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.returnedResults).toBe(150);
    expect(result.results[149]?.rank).toBe(150);
    fetchMock.mockRestore();
  });

  it('propagates a failure from a later page without returning partial results', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const page = Number(new URL(String(input)).searchParams.get('page'));
      if (page === 2) return new Response(JSON.stringify({ message: 'page failed' }), { status: 500 });
      return jsonResponse({
        meta: { count: 200 },
        results: Array.from({ length: 100 }, (_, index) => ({
          id: `https://openalex.org/W${index}`,
          display_name: `Work ${index}`,
        })),
      });
    });

    await expect(
      new OpenAlexClient({ baseUrl: 'https://example.test', maxRetries: 0 }).search('heart attack', { limit: 200 }),
    ).rejects.toMatchObject({ code: 'UPSTREAM_ERROR', status: 500 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
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
    const result = await client.search('recovery', { limit: 1 });
    expect(result.results[0]?.title).toBe('Recovered work');
    expect(result.quota).toMatchObject({ limit: 10000, remaining: 9999, creditsUsed: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fetchMock.mockRestore();
  });
});
