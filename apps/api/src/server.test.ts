import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SearchResponse } from '@scopus/shared';
import { buildServer } from './server.js';

const response: SearchResponse = {
  query: 'test query',
  requestedLimit: 2,
  totalResults: 2,
  returnedResults: 2,
  hydratedResults: 2,
  failedResults: 0,
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
    server = await buildServer({ config: { port: 3000, host: '127.0.0.1', baseUrl: 'https://api.elsevier.com', requestTimeoutMs: 1000, maxRetries: 0, hydrationConcurrency: 1, corsOrigin: '*' } });
    const result = await server.inject({ method: 'GET', url: '/health' });
    expect(result.statusCode).toBe(200);
    expect(result.json()).toEqual({ status: 'ok', service: 'scopus-api' });
  });

  it('validates search parameters', async () => {
    server = await buildServer({ config: { port: 3000, host: '127.0.0.1', baseUrl: 'https://api.elsevier.com', requestTimeoutMs: 1000, maxRetries: 0, hydrationConcurrency: 1, corsOrigin: '*' } });
    const result = await server.inject({ method: 'GET', url: '/api/search?limit=101' });
    expect(result.statusCode).toBe(400);
    expect(result.json().error.code).toBe('INVALID_QUERY');
  });

  it('returns a not-configured response without an API key', async () => {
    server = await buildServer({ config: { port: 3000, host: '127.0.0.1', baseUrl: 'https://api.elsevier.com', requestTimeoutMs: 1000, maxRetries: 0, hydrationConcurrency: 1, corsOrigin: '*' } });
    const result = await server.inject({ method: 'GET', url: '/api/search?q=machine+learning' });
    expect(result.statusCode).toBe(503);
    expect(result.json().error.code).toBe('SCOPUS_NOT_CONFIGURED');
  });

  it('returns a client search response', async () => {
    const client = { searchAndHydrate: vi.fn().mockResolvedValue(response) };
    server = await buildServer({ client: client as never, config: { port: 3000, host: '127.0.0.1', baseUrl: 'https://api.elsevier.com', requestTimeoutMs: 1000, maxRetries: 0, hydrationConcurrency: 1, corsOrigin: '*' } });
    const result = await server.inject({ method: 'GET', url: '/api/search?q=test+query&limit=2' });
    expect(result.statusCode).toBe(200);
    expect(client.searchAndHydrate).toHaveBeenCalledWith('test query', 2, 1);
  });
});
