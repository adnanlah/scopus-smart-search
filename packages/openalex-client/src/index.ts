import type { QuotaInfo, SearchResponse } from '@openalex/shared';
import { OpenAlexClientError } from './errors.js';
import { parseWork } from './parser.js';

export { OpenAlexClientError } from './errors.js';
export { parseWork, reconstructAbstract } from './parser.js';

export interface OpenAlexClientOptions {
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
}

export interface OpenAlexSearchOptions {
  limit?: number;
  fromPublicationYear?: number;
  filter?: string;
}

interface ResponseMetadata {
  quota?: QuotaInfo;
}

const sleep = (milliseconds: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, milliseconds));

const parseQuota = (response: Response): QuotaInfo | undefined => {
  const parseNumber = (name: string): number | undefined => {
    const value = response.headers.get(name);
    if (!value) return undefined;
    const number = Number(value);
    return Number.isFinite(number) ? number : undefined;
  };
  const limit = parseNumber('x-ratelimit-limit');
  const remaining = parseNumber('x-ratelimit-remaining');
  const creditsUsed = parseNumber('x-ratelimit-credits-used');
  const resetSeconds = parseNumber('x-ratelimit-reset');
  if (limit === undefined && remaining === undefined && creditsUsed === undefined && resetSeconds === undefined) return undefined;
  return {
    limit,
    remaining,
    creditsUsed,
    resetAt: resetSeconds !== undefined ? new Date(Date.now() + resetSeconds * 1000).toISOString() : undefined,
  };
};

const safeErrorMessage = (status: number, body: string): string => {
  if (status === 401 || status === 403) return 'OpenAlex rejected the configured credentials or request.';
  if (status === 429) return 'OpenAlex rate limit or daily budget was exceeded.';
  try {
    const parsed = JSON.parse(body) as { message?: unknown; error?: unknown };
    const message = typeof parsed.message === 'string' ? parsed.message : typeof parsed.error === 'string' ? parsed.error : undefined;
    if (message) return `OpenAlex request failed with HTTP ${status}: ${message.slice(0, 300)}`;
  } catch {
    // Fall back to the compact response body below.
  }
  const compact = body.replace(/\s+/g, ' ').trim();
  return compact ? `OpenAlex request failed with HTTP ${status}: ${compact.slice(0, 300)}` : `OpenAlex request failed with HTTP ${status}.`;
};

export class OpenAlexClient {
  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  public constructor(options: OpenAlexClientOptions = {}) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? 'https://api.openalex.org').replace(/\/$/, '');
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.maxRetries = options.maxRetries ?? 2;
  }

  private async request<T>(path: string, searchParams: Record<string, string>): Promise<{ data: T; metadata: ResponseMetadata }> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(searchParams)) url.searchParams.set(key, value);
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await fetch(url, {
          headers: {
            Accept: 'application/json',
            ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
          },
          signal: controller.signal,
        });
        const quota = parseQuota(response);
        const body = await response.text();
        if (!response.ok) {
          const retryable = response.status === 429 || response.status >= 500;
          const error = new OpenAlexClientError(safeErrorMessage(response.status, body), {
            code: response.status === 429 ? 'RATE_LIMITED' : response.status >= 500 ? 'UPSTREAM_ERROR' : 'UPSTREAM_REJECTED',
            status: response.status,
            retryable,
          });
          if (!retryable || attempt >= this.maxRetries) throw error;
          const retryAfter = Number(response.headers.get('retry-after'));
          const delay = Number.isFinite(retryAfter) ? retryAfter * 1000 : Math.min(1_000 * 2 ** attempt, 8_000);
          await sleep(delay);
          continue;
        }
        try {
          return { data: JSON.parse(body) as T, metadata: { quota } };
        } catch {
          throw new OpenAlexClientError('OpenAlex returned an unreadable JSON response.', { code: 'INVALID_RESPONSE' });
        }
      } catch (error) {
        lastError = error;
        if (error instanceof OpenAlexClientError && !error.retryable) throw error;
        if (attempt >= this.maxRetries) {
          if (error instanceof OpenAlexClientError) throw error;
          const timedOut = error instanceof Error && error.name === 'AbortError';
          throw new OpenAlexClientError(timedOut ? 'OpenAlex request timed out.' : 'OpenAlex request could not be completed.', {
            code: timedOut ? 'TIMEOUT' : 'NETWORK_ERROR',
          });
        }
        await sleep(Math.min(500 * 2 ** attempt, 4_000));
      } finally {
        clearTimeout(timeout);
      }
    }
    throw lastError instanceof Error ? lastError : new OpenAlexClientError('OpenAlex request failed.', { code: 'UNKNOWN' });
  }

  public async search(query: string, options: OpenAlexSearchOptions = {}): Promise<SearchResponse> {
    const requestedLimit = Math.min(Math.max(Math.trunc(options.limit ?? 100), 1), 100);
    const searchParams: Record<string, string> = {
      search: query,
      page: '1',
      per_page: String(requestedLimit),
      select: 'id,display_name,title,doi,type,language,publication_date,publication_year,biblio,abstract_inverted_index,authorships,primary_location,open_access,cited_by_count,topics,keywords,indexed_in,is_retracted,ids',
    };
    const filters = ['primary_location.source.is_core:true'];
    if (options.fromPublicationYear !== undefined) filters.push(`from_publication_date:${options.fromPublicationYear}-01-01`);
    if (options.filter) filters.push(options.filter);
    searchParams.filter = filters.join(',');
    const response = await this.request<{ meta?: { count?: number }; results?: unknown[] }>('/works', searchParams);
    const results = (response.data.results ?? []).map((work, index) => parseWork(work, index + 1));
    return {
      query,
      requestedLimit,
      totalResults: typeof response.data.meta?.count === 'number' ? response.data.meta.count : results.length,
      returnedResults: results.length,
      results,
      extractedKeywords: [],
      errors: [],
      quota: response.metadata.quota,
    };
  }
}
