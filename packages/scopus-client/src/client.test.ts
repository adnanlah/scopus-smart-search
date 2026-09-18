import { describe, expect, it, vi } from 'vitest';
import { ScopusClient } from './index.js';

const jsonResponse = (body: unknown, headers: Record<string, string> = {}): Response => new Response(JSON.stringify(body), {
  status: 200,
  headers: { 'content-type': 'application/json', ...headers },
});

describe('ScopusClient', () => {
  it('builds a STANDARD search request capped at 100 results', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ 'search-results': { 'opensearch:totalResults': '0', entry: [] } }));
    const client = new ScopusClient({ apiKey: 'secret', baseUrl: 'https://example.test' });
    await client.search('heart attack AND text(liver)', 500);
    const [input, init] = fetchMock.mock.calls[0] ?? [];
    const url = new URL(String(input));
    expect(url.pathname).toBe('/content/search/scopus');
    expect(url.searchParams.get('query')).toBe('heart attack AND text(liver)');
    expect(url.searchParams.get('count')).toBe('100');
    expect(url.searchParams.get('view')).toBe('STANDARD');
    expect((init?.headers as Record<string, string>)['X-ELS-APIKey']).toBe('secret');
    fetchMock.mockRestore();
  });

  it('retries a rate-limited request and parses XML abstract data', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('rate limited', { status: 429, headers: { 'retry-after': '0' } }))
      .mockResolvedValueOnce(new Response('<abstracts-retrieval-response><coredata><dc:title>Full title</dc:title><dc:description>Abstract text</dc:description></coredata></abstracts-retrieval-response>', { status: 200, headers: { 'content-type': 'application/xml' } }));
    const client = new ScopusClient({ apiKey: 'secret', baseUrl: 'https://example.test', maxRetries: 1 });
    const result = await client.getFullAbstract({
      rank: 1,
      scopusId: '123',
      authors: [],
      affiliations: [],
      publication: {},
      identifiers: {},
      metrics: {},
      access: {},
      links: {},
      hydration: { status: 'unavailable' },
      searchMetadata: {},
    });
    expect(result.title).toBe('Full title');
    expect(result.abstract).toBe('Abstract text');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fetchMock.mockRestore();
  });
});
