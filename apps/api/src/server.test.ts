import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SearchResponse } from '@openalex/shared';
import { buildServer } from './server.js';

const response: SearchResponse = {
  query: 'test query',
  requestedLimit: 2,
  totalResults: 2,
  returnedResults: 2,
  results: [],
  errors: [],
};

describe('API server', () => {
  let server: Awaited<ReturnType<typeof buildServer>> | undefined;

  afterEach(async () => {
    vi.restoreAllMocks();
    await server?.close();
  });

  it('returns health status', async () => {
    server = await buildServer({ config: { port: 3000, host: '127.0.0.1', baseUrl: 'https://api.openalex.org', requestTimeoutMs: 1000, maxRetries: 0, corsOrigin: '*' } });
    const result = await server.inject({ method: 'GET', url: '/health' });
    expect(result.statusCode).toBe(200);
    expect(result.json()).toEqual({ status: 'ok', service: 'openalex-api' });
  });

  it('validates search parameters', async () => {
    server = await buildServer({ config: { port: 3000, host: '127.0.0.1', baseUrl: 'https://api.openalex.org', requestTimeoutMs: 1000, maxRetries: 0, corsOrigin: '*' } });
    const result = await server.inject({ method: 'GET', url: '/api/search?limit=101' });
    expect(result.statusCode).toBe(400);
    expect(result.json().error.code).toBe('INVALID_QUERY');
  });

  it('supports anonymous OpenAlex configuration through an injected client', async () => {
    const client = { search: vi.fn().mockResolvedValue({ ...response, query: 'machine learning', requestedLimit: 100 }) };
    server = await buildServer({ client: client as never, config: { port: 3000, host: '127.0.0.1', baseUrl: 'https://api.openalex.org', requestTimeoutMs: 1000, maxRetries: 0, corsOrigin: '*' } });
    const result = await server.inject({ method: 'GET', url: '/api/search?q=machine+learning' });
    expect(result.statusCode).toBe(200);
    expect(client.search).toHaveBeenCalledWith('machine learning', 100);
  });

  it('returns a client search response', async () => {
    const client = { search: vi.fn().mockResolvedValue(response) };
    server = await buildServer({ client: client as never, config: { port: 3000, host: '127.0.0.1', baseUrl: 'https://api.openalex.org', requestTimeoutMs: 1000, maxRetries: 0, corsOrigin: '*' } });
    const result = await server.inject({ method: 'GET', url: '/api/search?q=test+query&limit=2' });
    expect(result.statusCode).toBe(200);
    expect(client.search).toHaveBeenCalledWith('test query', 2);
  });
});
