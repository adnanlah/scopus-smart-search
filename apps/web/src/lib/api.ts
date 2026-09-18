import type { ScopusResult, SearchError, SearchResponse } from '@scopus/shared';

export interface SearchParams {
  query: string;
  limit: number;
}

export type HydrationIssueKind = 'access' | 'rate-limit' | 'other';

export interface HydrationSummary {
  requested: number;
  hydrated: number;
  failed: number;
  issue?: {
    kind: HydrationIssueKind;
    code: string;
    message: string;
  };
}

export interface Paper {
  id: string;
  rank: number;
  title: string;
  authors: string[];
  year?: string;
  venue?: string;
  publicationDate?: string;
  abstract?: string;
  doi?: string;
  externalUrl?: string;
  citedByCount?: number;
  openAccess: boolean;
  hydrationStatus: ScopusResult['hydration']['status'];
}

export interface PaperSearchResult {
  query: string;
  totalResults: number;
  returnedResults: number;
  hydratedResults: number;
  failedResults: number;
  searchErrors: SearchError[];
  hydration: HydrationSummary;
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

const rawAuthorName = (raw: Record<string, unknown> | undefined): string | undefined => {
  if (!raw) return undefined;
  const directName = [raw.authname, raw.name, raw['ce:indexed-name'], raw.indexedName, raw['dc:creator']]
    .map(cleanAuthorName)
    .find(Boolean);
  if (directName) return directName;
  const preferred = raw['preferred-name'] ?? raw['ce:preferred-name'];
  if (preferred && typeof preferred === 'object' && !Array.isArray(preferred)) {
    const preferredRecord = preferred as Record<string, unknown>;
    return [preferredRecord['given-name'], preferredRecord.surname, preferredRecord.initials]
      .map(cleanAuthorName)
      .filter(Boolean)
      .join(' ') || undefined;
  }
  return undefined;
};

const getAuthorNames = (result: ScopusResult): string[] => {
  const names = result.authors
    .map((author) => {
      const fromParts = [author.givenName, author.surname].filter(Boolean).join(' ');
      return cleanAuthorName(author.name) ?? cleanAuthorName(fromParts) ?? rawAuthorName(author.raw);
    })
    .map(cleanAuthorName)
    .filter((author): author is string => Boolean(author));
  if (names.length > 0) return [...new Set(names)];

  const creator = result.searchMetadata['dc:creator'] ?? result.searchMetadata.creator;
  if (typeof creator === 'string') return [creator.trim()].filter(Boolean);
  return [];
};

const getPublicPaperUrl = (result: ScopusResult): string | undefined => {
  const candidates = [result.links.scopus, result.links.record, result.links['paper']];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const url = new URL(candidate);
      const hostname = url.hostname.toLowerCase();
      if (hostname === 'scopus.com' || hostname.endsWith('.scopus.com')) return candidate;
    } catch {
      // Ignore malformed backend links and continue to the next candidate.
    }
  }
  return undefined;
};

const getHydrationIssueKind = (code: string): HydrationIssueKind => {
  if (code === 'UPSTREAM_REJECTED') return 'access';
  if (code === 'RATE_LIMITED') return 'rate-limit';
  return 'other';
};
const toPaper = (result: ScopusResult): Paper => ({
  id: result.eid ?? result.scopusId ?? result.identifiers.doi ?? `rank-${result.rank}`,
  rank: result.rank,
  title: result.title?.trim() || 'Untitled paper',
  authors: getAuthorNames(result),
  year: result.publication.coverDate?.slice(0, 4) ?? result.publication.publicationDate?.slice(0, 4),
  venue: result.publication.name,
  publicationDate: result.publication.publicationDate ?? result.publication.coverDate,
  abstract: result.abstract?.trim() || undefined,
  doi: result.identifiers.doi,
  externalUrl: getPublicPaperUrl(result),
  citedByCount: result.metrics.citedByCount ?? result.metrics.citationCount,
  openAccess: result.access.openAccess ?? false,
  hydrationStatus: result.hydration.status,
});

export const searchPapers = async ({ query, limit }: SearchParams, signal?: AbortSignal): Promise<PaperSearchResult> => {
  const params = new URLSearchParams({ q: query.trim(), limit: String(limit) });
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
    hydratedResults: data.hydratedResults,
    failedResults: data.failedResults,
    searchErrors: data.errors,
    hydration: {
      requested: data.returnedResults,
      hydrated: data.hydratedResults,
      failed: data.failedResults,
      issue: data.errors[0] ? {
        kind: getHydrationIssueKind(data.errors[0].code),
        code: data.errors[0].code,
        message: data.errors[0].message,
      } : undefined,
    },
    papers: data.results.map(toPaper),
  };
};

export const getPaperId = (paper: Paper) => paper.id;