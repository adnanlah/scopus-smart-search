import { XMLParser } from 'fast-xml-parser';
import type { QuotaInfo, ScopusResult, SearchError, SearchResponse } from '@scopus/shared';
import { ScopusClientError } from './errors.js';
import { parseAbstractPayload, parseSearchPayload } from './parser.js';

export { ScopusClientError } from './errors.js';
export { parseAbstractPayload, parseSearchEntry, parseSearchPayload, textContent } from './parser.js';

export interface ScopusClientOptions {
  apiKey: string;
  institutionToken?: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
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
  const reset = response.headers.get('x-ratelimit-reset');
  const resetNumber = reset ? Number(reset) : undefined;
  if (limit === undefined && remaining === undefined && resetNumber === undefined) return undefined;
  return {
    limit,
    remaining,
    resetAt: resetNumber !== undefined && Number.isFinite(resetNumber) ? new Date(resetNumber * 1000).toISOString() : undefined,
  };
};

const safeErrorMessage = (status: number, body: string): string => {
  if (status === 401 || status === 403) return 'Scopus rejected the credentials or entitlement for this request.';
  if (status === 429) return 'Scopus rate limit or quota was exceeded.';
  const compact = body.replace(/\s+/g, ' ').trim();
  return compact ? `Scopus request failed with HTTP ${status}: ${compact.slice(0, 300)}` : `Scopus request failed with HTTP ${status}.`;
};

const extractScopusId = (result: ScopusResult): string | undefined => result.scopusId ?? result.eid;

const mapWithConcurrency = async <T, R>(items: T[], concurrency: number, mapper: (item: T, index: number) => Promise<R>): Promise<R[]> => {
  const output = new Array<R>(items.length);
  let nextIndex = 0;
  const worker = async (): Promise<void> => {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      output[index] = await mapper(items[index] as T, index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(items.length, 1)) }, () => worker()));
  return output;
};

export class ScopusClient {
  private readonly apiKey: string;
  private readonly institutionToken?: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  public constructor(options: ScopusClientOptions) {
    this.apiKey = options.apiKey;
    this.institutionToken = options.institutionToken;
    this.baseUrl = (options.baseUrl ?? 'https://api.elsevier.com').replace(/\/$/, '');
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.maxRetries = options.maxRetries ?? 2;
  }

  private async request<T>(path: string, searchParams: Record<string, string>, accept: string): Promise<{ data: T; metadata: ResponseMetadata }> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(searchParams)) url.searchParams.set(key, value);
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await fetch(url, {
          headers: {
            Accept: accept,
            'X-ELS-APIKey': this.apiKey,
            ...(this.institutionToken ? { 'X-ELS-Insttoken': this.institutionToken } : {}),
          },
          signal: controller.signal,
        });
        const quota = parseQuota(response);
        const body = await response.text();
        if (!response.ok) {
          const retryable = response.status === 429 || response.status >= 500;
          const error = new ScopusClientError(safeErrorMessage(response.status, body), {
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
          const data = accept.includes('xml') ? (new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', removeNSPrefix: false, trimValues: false }).parse(body) as T) : (JSON.parse(body) as T);
          return { data, metadata: { quota } };
        } catch (error) {
          throw new ScopusClientError(`Scopus returned an unreadable ${accept} response.`, { code: 'INVALID_RESPONSE' });
        }
      } catch (error) {
        lastError = error;
        if (error instanceof ScopusClientError && !error.retryable) throw error;
        if (attempt >= this.maxRetries) {
          if (error instanceof ScopusClientError) throw error;
          const message = error instanceof Error && error.name === 'AbortError' ? 'Scopus request timed out.' : 'Scopus request could not be completed.';
          throw new ScopusClientError(message, { code: error instanceof Error && error.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR', retryable: false });
        }
        await sleep(Math.min(500 * 2 ** attempt, 4_000));
      } finally {
        clearTimeout(timeout);
      }
    }
    throw lastError instanceof Error ? lastError : new ScopusClientError('Scopus request failed.', { code: 'UNKNOWN' });
  }

  public async search(query: string, count = 100): Promise<{ results: ScopusResult[]; totalResults: number; quota?: QuotaInfo }> {
    const boundedCount = Math.min(Math.max(Math.trunc(count), 1), 100);
    const response = await this.request<unknown>('/content/search/scopus', {
      query,
      start: '0',
      count: String(boundedCount),
      view: 'STANDARD',
    }, 'application/json');
    const parsed = parseSearchPayload(response.data);
    return { results: parsed.entries, totalResults: parsed.totalResults, quota: response.metadata.quota };
  }

  public async getFullAbstract(result: ScopusResult): Promise<ScopusResult> {
    const identifier = extractScopusId(result);
    if (!identifier) throw new ScopusClientError('The result has no Scopus identifier.', { code: 'MISSING_IDENTIFIER' });
    const prefix = result.scopusId ? 'scopus_id' : 'eid';
    const response = await this.request<unknown>(`/content/abstract/${prefix}/${encodeURIComponent(identifier)}`, { view: 'FULL' }, 'application/xml');
    return parseAbstractPayload(response.data, result);
  }

  public async searchAndHydrate(query: string, count = 100, concurrency = 6): Promise<SearchResponse> {
    const search = await this.search(query, count);
    const errors: SearchError[] = [];
    const results = await mapWithConcurrency(search.results, Math.max(1, Math.min(Math.trunc(concurrency), 8)), async (result) => {
      if (!extractScopusId(result)) {
        return { ...result, hydration: { status: 'unavailable' as const, error: 'No Scopus identifier was returned for this result.' } };
      }
      try {
        return { ...(await this.getFullAbstract(result)), hydration: { status: 'complete' as const } };
      } catch (error) {
        const code = error instanceof ScopusClientError ? error.code : 'HYDRATION_FAILED';
        const message = error instanceof Error ? error.message : 'Abstract retrieval failed.';
        errors.push({ rank: result.rank, code, message });
        return { ...result, hydration: { status: 'failed' as const, error: message } };
      }
    });
    const hydratedResults = results.filter((result) => result.hydration.status === 'complete').length;
    return {
      query,
      requestedLimit: Math.min(Math.max(Math.trunc(count), 1), 100),
      totalResults: search.totalResults,
      returnedResults: results.length,
      hydratedResults,
      failedResults: results.length - hydratedResults,
      results,
      errors: errors.sort((left, right) => (left.rank ?? 0) - (right.rank ?? 0)),
      quota: search.quota,
    };
  }
}
