import { describe, expect, it, vi } from 'vitest';
import { ApiError, searchPapers } from './api';

describe('searchPapers', () => {
  it('builds the supported query and normalizes paper metadata', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      query: 'graph neural networks',
      requestedLimit: 10,
      totalResults: 1,
      returnedResults: 1,
      hydratedResults: 1,
      failedResults: 1,
      results: [{
        rank: 1,
        eid: '2-s2.0-1',
        title: 'Graph neural networks',
        abstract: 'An abstract.',
        authors: [{ name: 'Ada Lovelace', affiliations: [] }],
        affiliations: [],
        publication: { name: 'Research Journal', coverDate: '2024-05-01' },
        identifiers: { doi: '10.1000/example' },
        metrics: { citedByCount: 12 },
        access: { openAccess: true },
        links: { scopus: 'https://example.test/paper' },
        hydration: { status: 'complete' },
        searchMetadata: {},
      }],
      errors: [{ code: 'ABSTRACT_FAILED', message: 'Abstract unavailable.' }],
    }), { status: 200 })));

    const result = await searchPapers({ query: '  graph neural networks ', limit: 10 });
    expect(fetch).toHaveBeenCalledWith('/api/search?q=graph+neural+networks&limit=10', expect.objectContaining({ signal: undefined }));
    expect(result.papers[0]).toMatchObject({ rank: 1, title: 'Graph neural networks', year: '2024', publicationDate: '2024-05-01', citedByCount: 12, openAccess: true });
    expect(result.searchErrors).toEqual([{ code: 'ABSTRACT_FAILED', message: 'Abstract unavailable.' }]);
    expect(result.failedResults).toBe(1);
  });

  it('surfaces backend error messages', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'Scopus is unavailable.' } }), { status: 503 })));
    await expect(searchPapers({ query: 'test', limit: 10 })).rejects.toMatchObject({ name: 'ApiError', status: 503, code: 'REQUEST_FAILED', message: 'Scopus is unavailable.' } satisfies Partial<ApiError>);
  });
});
