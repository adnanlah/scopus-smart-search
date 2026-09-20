import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SearchResponse, WorkResult } from '@openalex/shared';
import { buildServer } from './server.js';
import { JournalRankingIndex, parseJournalRankingDataset } from './journal-quality.js';

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

  it('requires at least seven words when a search description is provided', async () => {
    const client = { search: vi.fn().mockResolvedValue(response) };
    server = await buildServer({ client: client as never, config });

    const result = await server.inject({
      method: 'GET',
      url: '/api/search?q=short&filter=one+two+three+four+five+six',
    });

    expect(result.statusCode).toBe(400);
    expect(result.json()).toEqual({
      error: { code: 'INVALID_QUERY', message: 'Search description must contain at least 7 words.' },
    });
    expect(client.search).not.toHaveBeenCalled();
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
    const keywordExtractor = { extract: vi.fn() };
    server = await buildServer({ client: client as never, keywordExtractor, config });
    const result = await server.inject({ method: 'GET', url: '/api/search?q=test+query&limit=2' });
    expect(result.statusCode).toBe(200);
    expect(client.search).toHaveBeenCalledWith('test query', {
      limit: 2,
      fromPublicationYear: undefined,
    });
    expect(keywordExtractor.extract).not.toHaveBeenCalled();
    expect(result.json().extractedKeywords).toEqual([]);
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

  it('filters locally by SJR quartile using OpenAlex source identifiers', async () => {
    const q1Work: WorkResult = {
      ...work,
      publication: { name: 'Q1 Journal', sourceType: 'journal', issnL: '1234-5678', issn: '1234-5678' },
    };
    const unrankedWork: WorkResult = {
      ...work,
      publication: { name: 'Unranked Journal', sourceType: 'journal', issnL: '1111-1111', issn: '1111-1111' },
    };
    const client = { search: vi.fn().mockResolvedValue({ ...response, results: [q1Work, unrankedWork], requestedLimit: 100 }) };
    const journalRankingIndex = new JournalRankingIndex(parseJournalRankingDataset({
      version: 1,
      source: 'test',
      entries: [{ identifiers: ['1234-5678'], metrics: [{ metricYear: 2024, quartile: 'Q1' }] }],
    }));
    server = await buildServer({ client: client as never, journalRankingIndex, config });

    const result = await server.inject({ method: 'GET', url: '/api/search?q=test&journalQuality=q1' });

    expect(result.statusCode).toBe(200);
    expect(client.search).toHaveBeenCalledWith('test', {
      limit: 1000,
      fromPublicationYear: undefined,
    });
    expect(result.json()).toMatchObject({
      returnedResults: 1,
      eligibleResults: 1,
      journalQuality: 'q1',
      results: [{ publication: { name: 'Q1 Journal' }, journalRanking: { status: 'ranked', quartile: 'Q1', metricYear: 2024 } }],
    });
  });

  it('rejects unsupported journal quality modes', async () => {
    const client = { search: vi.fn().mockResolvedValue(response) };
    server = await buildServer({ client: client as never, config });

    const result = await server.inject({ method: 'GET', url: '/api/search?q=test&journalQuality=top10' });

    expect(result.statusCode).toBe(400);
    expect(result.json().error.code).toBe('INVALID_QUERY');
    expect(client.search).not.toHaveBeenCalled();
  });

  it('runs Jev ranking after fetching the full OpenAlex candidate batch', async () => {
    const client = { search: vi.fn().mockResolvedValue({ ...response, requestedLimit: 100 }) };
    const semanticRanker = { rank: vi.fn().mockResolvedValue([{ ...work, semanticScore: 0.87 }]) };
    const rawKeywords = [
      { phrase: 'review', score: 0.99 },
      { phrase: 'human', score: 0.91 },
      { phrase: 'medical', score: 0.88 },
      { phrase: 'images', score: 0.85 },
      { phrase: 'image', score: 0.8 },
      { phrase: 'evaluations', score: 0.74 },
      { phrase: 'Human', score: 0.7 },
    ];
    const keywordExtractor = { extract: vi.fn().mockResolvedValue(rawKeywords) };
    server = await buildServer({ client: client as never, semanticRanker, keywordExtractor, config });

    const result = await server.inject({
      method: 'GET',
      url: '/api/search?q=test+query&filter=human+evaluations+for+medical+images+with+scarce+clinical+training+data&fromYear=2022&limit=10',
    });

    expect(result.statusCode).toBe(200);
    expect(client.search).toHaveBeenCalledWith('human evaluations medical images review', {
      limit: 1000,
      fromPublicationYear: 2022,
    });
    expect(semanticRanker.rank).toHaveBeenCalledWith(
      [work],
      'test query',
      'human evaluations for medical images with scarce clinical training data',
    );
    expect(keywordExtractor.extract).toHaveBeenCalledWith(
      'human evaluations for medical images with scarce clinical training data',
    );
    expect(result.json()).toMatchObject({
      totalResults: 2,
      returnedResults: 1,
      rankingCandidateCount: 1,
      results: [{ semanticScore: 0.87 }],
      extractedKeywords: [
        { phrase: 'human', score: 0.91 },
        { phrase: 'evaluations', score: 0.74 },
        { phrase: 'medical', score: 0.88 },
        { phrase: 'images', score: 0.85 },
        { phrase: 'review', score: 0.99 },
      ],
    });
  });

  it('returns a configuration error when AI reranking is requested without a Jev key', async () => {
    const client = { search: vi.fn().mockResolvedValue(response) };
    server = await buildServer({ client: client as never, config });

    const result = await server.inject({ method: 'GET', url: '/api/search?q=test&filter=human+evaluations+for+medical+images+with+scarce+clinical+training+data' });

    expect(result.statusCode).toBe(503);
    expect(result.json().error.code).toBe('TYPESAFE_NOT_CONFIGURED');
  });

  it('maps Jev failures without exposing provider details', async () => {
    const client = { search: vi.fn().mockResolvedValue(response) };
    const semanticRanker = { rank: vi.fn().mockRejectedValue(new Error('provider detail')) };
    const keywordExtractor = { extract: vi.fn().mockResolvedValue([{ phrase: 'human', score: 0.9 }]) };
    server = await buildServer({ client: client as never, semanticRanker, keywordExtractor, config });

    const result = await server.inject({ method: 'GET', url: '/api/search?q=test&filter=human+evaluations+for+medical+images+with+scarce+clinical+training+data' });

    expect(result.statusCode).toBe(502);
    expect(result.json()).toEqual({ error: { code: 'TYPESAFE_REQUEST_FAILED', message: 'AI reranking could not be completed.' } });
  });

  it('maps keyword extraction failures without exposing model details', async () => {
    const client = { search: vi.fn().mockResolvedValue(response) };
    const semanticRanker = { rank: vi.fn().mockResolvedValue([work]) };
    const keywordExtractor = { extract: vi.fn().mockRejectedValue(new Error('model detail')) };
    server = await buildServer({ client: client as never, semanticRanker, keywordExtractor, config });

    const result = await server.inject({ method: 'GET', url: '/api/search?q=test&filter=human+evaluations+for+medical+images+with+scarce+clinical+training+data' });

    expect(result.statusCode).toBe(502);
    expect(semanticRanker.rank).not.toHaveBeenCalled();
    expect(client.search).not.toHaveBeenCalled();
    expect(result.json()).toEqual({ error: { code: 'KEYWORD_EXTRACTION_FAILED', message: 'Keywords could not be extracted.' } });
  });

  it('rejects filtered searches when no searchable keywords are extracted', async () => {
    const client = { search: vi.fn().mockResolvedValue(response) };
    const semanticRanker = { rank: vi.fn() };
    const keywordExtractor = { extract: vi.fn().mockResolvedValue([]) };
    server = await buildServer({ client: client as never, semanticRanker, keywordExtractor, config });

    const result = await server.inject({ method: 'GET', url: '/api/search?q=the&filter=the+same+empty+generic+words+without+useful+searchable+topic+terms' });

    expect(result.statusCode).toBe(400);
    expect(result.json()).toEqual({ error: { code: 'NO_SEARCH_KEYWORDS', message: 'No searchable keywords could be extracted.' } });
    expect(client.search).not.toHaveBeenCalled();
    expect(semanticRanker.rank).not.toHaveBeenCalled();
  });
});
