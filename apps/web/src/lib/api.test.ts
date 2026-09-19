import { describe, expect, it, vi } from 'vitest';
import { ApiError, searchPapers } from './api';

describe('searchPapers', () => {
  it('builds the supported query and normalizes paper metadata', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      query: 'graph neural networks',
      requestedLimit: 10,
      totalResults: 1,
      returnedResults: 1,
      results: [{
        rank: 1,
        openAlexId: 'https://openalex.org/W1',
        title: 'Graph neural networks',
        abstract: 'An abstract.',
        authors: [{ name: 'Ada Lovelace', affiliations: [] }],
        affiliations: [],
        publication: { name: 'Research Journal', coverDate: '2024-05-01' },
        identifiers: { doi: '10.1000/example' },
        metrics: { citedByCount: 12 },
        access: { openAccess: true },
        links: { openalex: 'https://openalex.org/W1' },
        searchMetadata: {},
        semanticScore: 0.84,
      }],
      errors: [],
    }), { status: 200 })));

    const result = await searchPapers({ query: '  graph neural networks ' });
    expect(fetch).toHaveBeenCalledWith('/api/search?q=graph+neural+networks&limit=100', expect.objectContaining({ signal: undefined }));
    expect(result.papers[0]).toMatchObject({ rank: 1, title: 'Graph neural networks', year: '2024', publicationDate: '2024-05-01', citedByCount: 12, openAccess: true, semanticScore: 0.84 });
    expect(result.searchErrors).toEqual([]);
  });

  it('encodes the optional semantic filter', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      query: 'graph neural networks',
      requestedLimit: 100,
      totalResults: 10,
      returnedResults: 1,
      results: [],
      errors: [],
    }), { status: 200 })));

    await searchPapers({ query: 'graph neural networks', filter: 'human evaluation & recall' });

    expect(fetch).toHaveBeenCalledWith('/api/search?q=graph+neural+networks&limit=100&filter=human+evaluation+%26+recall', expect.objectContaining({ signal: undefined }));
  });

  it('surfaces backend error messages', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'OpenAlex is unavailable.' } }), { status: 503 })));
    await expect(searchPapers({ query: 'test' })).rejects.toMatchObject({ name: 'ApiError', status: 503, code: 'REQUEST_FAILED', message: 'OpenAlex is unavailable.' } satisfies Partial<ApiError>);
  });
});
