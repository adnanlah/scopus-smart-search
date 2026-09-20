import type { ExtractedKeyword, JournalQuality, JournalRanking, SearchError, SearchInterpretation, SearchResponse, WorkResult } from '@openalex/shared';

export interface SearchParams {
  query: string;
  rankingPreference?: string;
  fromYear?: number;
  journalQuality?: JournalQuality;
}

export interface Paper {
  id: string;
  rank: number;
  title: string;
  authors: string[];
  year?: string;
  venue?: string;
  sourceType?: string;
  volume?: string;
  issue?: string;
  pageRange?: string;
  publicationDate?: string;
  abstract?: string;
  doi?: string;
  externalUrl?: string;
  citedByCount?: number;
  openAccess: boolean;
  license?: string;
  semanticScore?: number;
  journalRanking?: JournalRanking;
}

export interface PaperSearchResult {
  query: string;
  totalResults: number;
  returnedResults: number;
  eligibleResults?: number;
  rankingCandidateCount?: number;
  journalQuality?: JournalQuality;
  searchErrors: SearchError[];
  extractedKeywords: ExtractedKeyword[];
  interpretation?: SearchInterpretation;
  papers: Paper[];
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '/api').replace(/\/$/, '');

const cleanAuthorName = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const name = value.replace(/\s+/g, ' ').trim();
  return name || undefined;
};

const getAuthorNames = (result: WorkResult): string[] =>
  result.authors
    .map((author) => cleanAuthorName(author.name))
    .filter((author): author is string => Boolean(author));

const isAllowedExternalUrl = (candidate: string, kind: string): boolean => {
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:') return false;
    const hostname = url.hostname.toLowerCase();
    if (kind === 'openalex') return hostname === 'openalex.org' || hostname.endsWith('.openalex.org');
    if (kind === 'doi') return hostname === 'doi.org' || hostname === 'dx.doi.org';
    return true;
  } catch {
    return false;
  }
};

const getPublicPaperUrl = (result: WorkResult): string | undefined => {
  const candidates: Array<[string | undefined, string]> = [
    [result.links.oa, 'open-access'],
    [result.links.openalex, 'openalex'],
    [result.links.doi, 'doi'],
    [result.links.landing_page, 'landing-page'],
    [result.links.pdf, 'pdf'],
  ];
  return candidates.find(([candidate, kind]) => candidate && isAllowedExternalUrl(candidate, kind))?.[0];
};

const toPaper = (result: WorkResult): Paper => ({
  id: result.openAlexId ?? result.identifiers.doi ?? `rank-${result.rank}`,
  rank: result.rank,
  title: result.title?.trim() || 'Untitled work',
  authors: getAuthorNames(result),
  year: result.publication.coverDate?.slice(0, 4) ?? result.publication.publicationDate?.slice(0, 4),
  venue: result.publication.name,
  sourceType: result.publication.sourceType,
  volume: result.publication.volume,
  issue: result.publication.issueIdentifier,
  pageRange: result.publication.pageRange,
  publicationDate: result.publication.publicationDate ?? result.publication.coverDate,
  abstract: result.abstract?.trim() || undefined,
  doi: result.identifiers.doi,
  externalUrl: getPublicPaperUrl(result),
  citedByCount: result.metrics.citedByCount,
  openAccess: result.access.openAccess ?? false,
  license: result.access.license,
  semanticScore: result.semanticScore,
  journalRanking: result.journalRanking,
});

export const searchPapers = async ({ query, rankingPreference, fromYear, journalQuality }: SearchParams, signal?: AbortSignal): Promise<PaperSearchResult> => {
  const params = new URLSearchParams({ q: query.trim(), limit: '100' });
  const trimmedRankingPreference = rankingPreference?.trim();
  if (trimmedRankingPreference) params.set('filter', trimmedRankingPreference);
  if (fromYear !== undefined) params.set('fromYear', String(fromYear));
  if (journalQuality && journalQuality !== 'any') params.set('journalQuality', journalQuality);
  const response = await fetch(`${API_BASE_URL}/search?${params.toString()}`, { signal });

  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const error = typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'object' && body.error !== null
      ? body.error as { code?: unknown; message?: unknown }
      : undefined;
    const message = typeof error?.message === 'string' ? error.message : 'The search could not be completed.';
    const code = typeof error?.code === 'string' ? error.code : 'REQUEST_FAILED';
    throw new ApiError(message, response.status, code);
  }

  const data = body as SearchResponse;
  return {
    query: data.query,
    totalResults: data.totalResults,
    returnedResults: data.returnedResults,
    eligibleResults: data.eligibleResults,
    rankingCandidateCount: data.rankingCandidateCount,
    journalQuality: data.journalQuality,
    searchErrors: data.errors,
    extractedKeywords: data.extractedKeywords ?? [],
    interpretation: data.interpretation,
    papers: data.results.map(toPaper),
  };
};

export const getPaperId = (paper: Paper) => paper.id;
