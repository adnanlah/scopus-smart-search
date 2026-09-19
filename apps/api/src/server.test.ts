import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SearchResponse, WorkResult } from '@openalex/shared';
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
  query: 'test query',
  requestedLimit: 2,
  totalResults: 2,
  returnedResults: 1,
  results: [work],
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

describe('API server', () => {
  let server: Awaited<ReturnType<typeof buildServer>> | undefined;

  afterEach(async () => {
    vi.restoreAllMocks();
    await server?.close();
  });

  it('returns health status', async () => {
    server = await buildServer({ config });
    const result = await server.inject({ method: 'GET', url: '/health' });
    expect(result.statusCode).toBe(200);
    expect(result.json()).toEqual({ status: 'ok', service: 'openalex-api' });
  });

  it('validates search parameters', async () => {
    server = await buildServer({ config });
    const result = await server.inject({ method: 'GET', url: '/api/search?limit=101' });
    expect(result.statusCode).toBe(400);
    expect(result.json().error.code).toBe('INVALID_QUERY');
  });

  it('supports anonymous OpenAlex configuration through an injected client', async () => {
    const client = { search: vi.fn().mockResolvedValue({ ...response, query: 'machine learning', requestedLimit: 100 }) };
    server = await buildServer({ client: client as never, config });
    const result = await server.inject({ method: 'GET', url: '/api/search?q=machine+learning' });
    expect(result.statusCode).toBe(200);
    expect(client.search).toHaveBeenCalledWith('machine learning', {
      limit: 100,
      fromPublicationYear: undefined,
    });
  });

  it('returns a client search response', async () => {
    const client = { search: vi.fn().mockResolvedValue(response) };
    server = await buildServer({ client: client as never, config });
    const result = await server.inject({ method: 'GET', url: '/api/search?q=test+query&limit=2' });
    expect(result.statusCode).toBe(200);
    expect(client.search).toHaveBeenCalledWith('test query', {
      limit: 2,
      fromPublicationYear: undefined,
    });
  });

  it('validates and forwards the publication year to OpenAlex', async () => {
    const client = { search: vi.fn().mockResolvedValue(response) };
    server = await buildServer({ client: client as never, config });

    const result = await server.inject({ method: 'GET', url: '/api/search?q=test+query&fromYear=2022' });

    expect(result.statusCode).toBe(200);
    expect(client.search).toHaveBeenCalledWith('test query', {
      limit: 100,
      fromPublicationYear: 2022,
    });
  });

  it('rejects publication years later than the current year', async () => {
    const client = { search: vi.fn().mockResolvedValue(response) };
    server = await buildServer({ client: client as never, config });

    const result = await server.inject({
      method: 'GET',
      url: `/api/search?q=test&fromYear=${new Date().getFullYear() + 1}`,
    });

    expect(result.statusCode).toBe(400);
    expect(result.json().error.code).toBe('INVALID_QUERY');
    expect(client.search).not.toHaveBeenCalled();
  });

  it('runs Jev ranking after fetching the full OpenAlex candidate batch', async () => {
    const client = { search: vi.fn().mockResolvedValue({ ...response, requestedLimit: 100 }) };
    const semanticRanker = { rank: vi.fn().mockResolvedValue([{ ...work, semanticScore: 0.87 }]) };
    server = await buildServer({ client: client as never, semanticRanker, config });

    const result = await server.inject({
      method: 'GET',
      url: '/api/search?q=test+query&filter=human+evaluations&fromYear=2022&limit=10',
    });

    expect(result.statusCode).toBe(200);
    expect(client.search).toHaveBeenCalledWith('test query', {
      limit: 100,
      fromPublicationYear: 2022,
    });
    expect(semanticRanker.rank).toHaveBeenCalledWith([work], 'test query', 'human evaluations');
    expect(result.json()).toMatchObject({ totalResults: 2, returnedResults: 1, results: [{ semanticScore: 0.87 }] });
  });

  it('returns a configuration error when AI reranking is requested without a Jev key', async () => {
    const client = { search: vi.fn().mockResolvedValue(response) };
    server = await buildServer({ client: client as never, config });

    const result = await server.inject({ method: 'GET', url: '/api/search?q=test&filter=human+evaluations' });

    expect(result.statusCode).toBe(503);
    expect(result.json().error.code).toBe('TYPESAFE_NOT_CONFIGURED');
  });

  it('maps Jev failures without exposing provider details', async () => {
    const client = { search: vi.fn().mockResolvedValue(response) };
    const semanticRanker = { rank: vi.fn().mockRejectedValue(new Error('provider detail')) };
    server = await buildServer({ client: client as never, semanticRanker, config });

    const result = await server.inject({ method: 'GET', url: '/api/search?q=test&filter=human+evaluations' });

    expect(result.statusCode).toBe(502);
    expect(result.json()).toEqual({ error: { code: 'TYPESAFE_REQUEST_FAILED', message: 'AI reranking could not be completed.' } });
  });
});
