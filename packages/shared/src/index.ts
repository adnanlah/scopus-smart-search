export type HydrationStatus = 'complete' | 'unavailable' | 'failed';

export interface ScopusAuthor {
  name?: string;
  givenName?: string;
  surname?: string;
  initials?: string;
  authorId?: string;
  orcid?: string;
  affiliations: string[];
  raw?: Record<string, unknown>;
}

export interface ScopusAffiliation {
  id?: string;
  name?: string;
  city?: string;
  country?: string;
  raw?: Record<string, unknown>;
}

export interface ScopusResult {
  rank: number;
  scopusId?: string;
  eid?: string;
  title?: string;
  abstract?: string;
  authors: ScopusAuthor[];
  affiliations: ScopusAffiliation[];
  publication: {
    name?: string;
    volume?: string;
    issueIdentifier?: string;
    pageRange?: string;
    coverDate?: string;
    publicationDate?: string;
    issn?: string;
    isbn?: string;
    publisher?: string;
  };
  identifiers: {
    doi?: string;
    pii?: string;
    pubmedId?: string;
    piiOrPui?: string;
  };
  metrics: {
    citedByCount?: number;
    citationCount?: number;
  };
  access: {
    openAccess?: boolean;
    accessType?: string;
    license?: string;
  };
  links: Record<string, string>;
  hydration: {
    status: HydrationStatus;
    error?: string;
  };
  searchMetadata: Record<string, unknown>;
  abstractMetadata?: Record<string, unknown>;
}

export interface QuotaInfo {
  limit?: number;
  remaining?: number;
  resetAt?: string;
}

export interface SearchError {
  rank?: number;
  code: string;
  message: string;
}

export interface SearchResponse {
  query: string;
  requestedLimit: number;
  totalResults: number;
  returnedResults: number;
  hydratedResults: number;
  failedResults: number;
  results: ScopusResult[];
  errors: SearchError[];
  quota?: QuotaInfo;
}
