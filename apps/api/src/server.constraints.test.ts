import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SearchInterpretation, SearchResponse, WorkResult } from '@openalex/shared';
import { buildServer } from './server.js';

const work: WorkResult = {
  rank: 1,
  title: 'Filtered work',
  authors: [],
  affiliations: [],
  publication: { name: 'Research Journal' },
  identifiers: {},
  metrics: {},
  access: {},
  links: {},
  searchMetadata: {},
};

const response: SearchResponse = {
  query: 'computer science methods',
  requestedLimit: 100,
  totalResults: 1,
  returnedResults: 1,
  results: [work],
  extractedKeywords: [],
  errors: [],
};

const config = {
  port: 3000,
  host: '127.0.0.1',
  baseUrl: 'https://api.openalex.org',
  requestTimeoutMs: 1000,
  maxRetries: 0,
  corsOrigin: '*',
};

describe('API constraint integration', () => {
  let server: Awaited<ReturnType<typeof buildServer>> | undefined;

  afterEach(async () => {
    vi.restoreAllMocks();
    await server?.close();
  });

  it('passes applied Jev constraints into the OpenAlex request and response', async () => {
    const client = { search: vi.fn().mockResolvedValue(response) };
    const interpretation: SearchInterpretation = {
      threshold: 0.8,
      available: true,
      constraints: [{
        type: 'field',
        value: '17',
        label: 'Computer science',
        confidence: 0.94,
        applied: true,
        source: 'inferred',
        openAlexFilter: 'topics.field.id:17',
        status: 'applied',
        evidence: 'Matched “computer science”.',
      }],
    };
    const constraintInferer = { infer: vi.fn().mockResolvedValue(interpretation) };

    server = await buildServer({
      client: client as never,
      constraintInferer,
      config,
    });

    const result = await server.inject({
      method: 'GET',
      url: '/api/search?q=computer+science+methods+for+retrieval+systems',
    });

    expect(result.statusCode).toBe(200);
    expect(client.search).toHaveBeenCalledWith('computer science methods for retrieval systems', {
      limit: 100,
      fromPublicationYear: undefined,
      filter: 'topics.field.id:17',
    });
    expect(result.json().interpretation).toMatchObject({
      available: true,
      effectiveFilter: 'primary_location.source.is_core:true,topics.field.id:17',
      constraints: [expect.objectContaining({ applied: true, status: 'applied' })],
    });
  });

  it('continues with the unfiltered request when Jev inference fails', async () => {
    const client = { search: vi.fn().mockResolvedValue(response) };
    const constraintInferer = { infer: vi.fn().mockRejectedValue(new Error('provider failure')) };

    server = await buildServer({
      client: client as never,
      constraintInferer,
      config,
    });

    const result = await server.inject({
      method: 'GET',
      url: '/api/search?q=computer+science+methods+for+retrieval+systems',
    });

    expect(result.statusCode).toBe(200);
    expect(client.search).toHaveBeenCalledWith('computer science methods for retrieval systems', {
      limit: 100,
      fromPublicationYear: undefined,
    });
    expect(result.json().interpretation).toMatchObject({
      available: false,
      constraints: [],
    });
  });
});
