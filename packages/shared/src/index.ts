export const SEARCH_MIN_WORDS = 7;

const SEARCH_WORD_PATTERN = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;

export const countSearchWords = (value: string): number =>
  value.normalize('NFKC').match(SEARCH_WORD_PATTERN)?.length ?? 0;

export type JournalQuality = 'any' | 'q1' | 'q1-q2' | 'ranked' | 'include-unranked';

export type JournalQuartile = 'Q1' | 'Q2' | 'Q3' | 'Q4';

export interface JournalRanking {
  status: 'ranked' | 'unranked';
  quartile?: JournalQuartile;
  sjr?: number;
  metricYear?: number;
}

export interface WorkAuthor {
  id?: string;
  name?: string;
  orcid?: string;
  links?: Record<string, string>;
  position?: 'first' | 'middle' | 'last';
  corresponding?: boolean;
  countries?: string[];
  affiliations: string[];
  raw?: Record<string, unknown>;
}

export interface WorkTopic {
  id?: string;
  name: string;
  subfield?: string;
  field?: string;
  domain?: string;
  links?: Record<string, string>;
}

export interface WorkAffiliation {
  id?: string;
  name?: string;
  ror?: string;
  city?: string;
  country?: string;
  links?: Record<string, string>;
  raw?: Record<string, unknown>;
}

export interface WorkLocation {
  sourceName?: string;
  sourceType?: string;
  version?: string;
  landingPageUrl?: string;
  pdfUrl?: string;
  isPrimary?: boolean;
  isOpenAccess?: boolean;
  links: Record<string, string>;
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
    issnL?: string;
    issns?: string[];
    isbn?: string;
    publisher?: string;
    links?: Record<string, string>;
  };
  identifiers: {
    doi?: string;
    pubmedId?: string;
    pmcid?: string;
    arxiv?: string;
  };
  metrics: {
    citedByCount?: number;
  };
  access: {
    openAccess?: boolean;
    accessType?: string;
    license?: string;
  };
  locations?: WorkLocation[];
  journalRanking?: JournalRanking;
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

export interface ExtractedKeyword {
  phrase: string;
  score: number;
}

export type SearchConstraintType =
  | 'work_type'
  | 'domain'
  | 'field'
  | 'language'
  | 'open_access'
  | 'publication_year';

export type SearchConstraintStatus =
  | 'applied'
  | 'below_threshold'
  | 'ambiguous'
  | 'shadowed_by_explicit'
  | 'unsupported'
  | 'unknown';

export interface SearchConstraint {
  type: SearchConstraintType;
  value: string;
  label: string;
  confidence?: number;
  applied: boolean;
  source: 'explicit' | 'inferred';
  openAlexFilter?: string;
  status: SearchConstraintStatus;
  evidence?: string;
}

export interface SearchInterpretation {
  threshold: number;
  available: boolean;
  error?: string;
  constraints: SearchConstraint[];
  effectiveFilter?: string;
}
export interface SearchResponse {
  query: string;
  requestedLimit: number;
  totalResults: number;
  returnedResults: number;
  results: WorkResult[];
  extractedKeywords: ExtractedKeyword[];
  eligibleResults?: number;
  rankingCandidateCount?: number;
  journalQuality?: JournalQuality;
  interpretation?: SearchInterpretation;
  errors: SearchError[];
  quota?: QuotaInfo;
}
