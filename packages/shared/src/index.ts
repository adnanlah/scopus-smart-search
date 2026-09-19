export interface WorkAuthor {
  id?: string;
  name?: string;
  orcid?: string;
  position?: 'first' | 'middle' | 'last';
  corresponding?: boolean;
  countries?: string[];
  affiliations: string[];
  raw?: Record<string, unknown>;
}

export interface WorkTopic {
  name: string;
  subfield?: string;
  field?: string;
  domain?: string;
}

export interface WorkAffiliation {
  id?: string;
  name?: string;
  city?: string;
  country?: string;
  raw?: Record<string, unknown>;
}

export interface WorkResult {
  rank: number;
  semanticScore?: number;
  openAlexId?: string;
  title?: string;
  abstract?: string;
  workType?: string;
  language?: string;
  topics?: WorkTopic[];
  keywords?: string[];
  indexedIn?: string[];
  isRetracted?: boolean;
  authors: WorkAuthor[];
  affiliations: WorkAffiliation[];
  publication: {
    name?: string;
    sourceType?: string;
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
    pubmedId?: string;
    pmcid?: string;
  };
  metrics: {
    citedByCount?: number;
  };
  access: {
    openAccess?: boolean;
    accessType?: string;
    license?: string;
  };
  links: Record<string, string>;
  searchMetadata: Record<string, unknown>;
}

export interface QuotaInfo {
  limit?: number;
  remaining?: number;
  resetAt?: string;
  creditsUsed?: number;
}

export interface SearchError {
  code: string;
  message: string;
}

export interface SearchResponse {
  query: string;
  requestedLimit: number;
  totalResults: number;
  returnedResults: number;
  results: WorkResult[];
  errors: SearchError[];
  quota?: QuotaInfo;
}
