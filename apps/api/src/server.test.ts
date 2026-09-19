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
    expect(client.search).toHaveBeenCalledWith('machine learning', 100);
  });

  it('returns a client search response', async () => {
    const client = { search: vi.fn().mockResolvedValue(response) };
    server = await buildServer({ client: client as never, config });
    const result = await server.inject({ method: 'GET', url: '/api/search?q=test+query&limit=2' });
    expect(result.statusCode).toBe(200);
    expect(client.search).toHaveBeenCalledWith('test query', 2);
  });

  it('runs Jev after fetching the full OpenAlex candidate batch', async () => {
    const client = { search: vi.fn().mockResolvedValue({ ...response, requestedLimit: 100 }) };
    const semanticFilter = { filter: vi.fn().mockResolvedValue([{ ...work, semanticScore: 0.87 }]) };
    server = await buildServer({ client: client as never, semanticFilter, config });

    const result = await server.inject({ method: 'GET', url: '/api/search?q=test+query&filter=human+evaluations&limit=10' });

    expect(result.statusCode).toBe(200);
    expect(client.search).toHaveBeenCalledWith('test query', 100);
    expect(semanticFilter.filter).toHaveBeenCalledWith([work], 'human evaluations');
    expect(result.json()).toMatchObject({ totalResults: 2, returnedResults: 1, results: [{ semanticScore: 0.87 }] });
  });

  it('returns a configuration error when semantic filtering is requested without a Jev key', async () => {
    const client = { search: vi.fn().mockResolvedValue(response) };
    server = await buildServer({ client: client as never, config });

    const result = await server.inject({ method: 'GET', url: '/api/search?q=test&filter=human+evaluations' });

    expect(result.statusCode).toBe(503);
    expect(result.json().error.code).toBe('TYPESAFE_NOT_CONFIGURED');
  });

  it('maps Jev failures without exposing provider details', async () => {
    const client = { search: vi.fn().mockResolvedValue(response) };
    const semanticFilter = { filter: vi.fn().mockRejectedValue(new Error('provider detail')) };
    server = await buildServer({ client: client as never, semanticFilter, config });

    const result = await server.inject({ method: 'GET', url: '/api/search?q=test&filter=human+evaluations' });

    expect(result.statusCode).toBe(502);
    expect(result.json()).toEqual({ error: { code: 'TYPESAFE_REQUEST_FAILED', message: 'Semantic filtering could not be completed.' } });
  });
});
