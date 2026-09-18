import type {
  ScopusAffiliation,
  ScopusAuthor,
  ScopusResult,
} from '@scopus/shared';

type JsonRecord = Record<string, unknown>;

const asRecord = (value: unknown): JsonRecord =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};

const asArray = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];

const cleanString = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    const result = value.replace(/\s+/g, ' ').trim();
    return result || undefined;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value && typeof value === 'object') {
    const record = asRecord(value);
    return cleanString(record['#text'] ?? record.text ?? record.value);
  }
  return undefined;
};

const keyMatches = (key: string, names: string[]): boolean => {
  const normalizedKey = key.toLowerCase();
  const localKey = normalizedKey.replace(/^.*:/, '');
  return names.some((name) => {
    const normalizedName = name.toLowerCase();
    const localName = normalizedName.replace(/^.*:/, '');
    return normalizedKey === normalizedName || localKey === localName || localKey.endsWith(localName);
  });
};

const findValues = (value: unknown, names: string[], results: unknown[] = []): unknown[] => {
  if (Array.isArray(value)) {
    for (const item of value) findValues(item, names, results);
    return results;
  }
  if (!value || typeof value !== 'object') return results;
  for (const [key, child] of Object.entries(value)) {
    if (keyMatches(key, names)) results.push(child);
    findValues(child, names, results);
  }
  return results;
};

export const textContent = (value: unknown): string => {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(textContent).filter(Boolean).join(' ');
  if (typeof value === 'object') {
    const record = asRecord(value);
    return Object.entries(record)
      .filter(([key]) => key !== '@_id' && key !== '@_fa' && key !== '@_xml:lang')
      .map(([, child]) => textContent(child))
      .filter(Boolean)
      .join(' ');
  }
  return '';
};

const firstString = (value: unknown, names: string[]): string | undefined => {
  for (const candidate of findValues(value, names)) {
    const result = cleanString(candidate);
    if (result) return result;
  }
  return undefined;
};

const numberValue = (value: unknown): number | undefined => {
  const stringValue = cleanString(value);
  if (!stringValue) return undefined;
  const number = Number(stringValue);
  return Number.isFinite(number) ? number : undefined;
};

const firstNumber = (value: unknown, names: string[]): number | undefined => {
  for (const candidate of findValues(value, names)) {
    const result = numberValue(candidate);
    if (result !== undefined) return result;
  }
  return undefined;
};

const rawRecord = (value: unknown): JsonRecord => asRecord(value);

const extractLinks = (entry: JsonRecord): Record<string, string> => {
  const links: Record<string, string> = {};
  for (const link of asArray(entry.link)) {
    const record = asRecord(link);
    const ref = cleanString(record['@_ref'] ?? record.ref);
    const href = cleanString(record['@_href'] ?? record.href);
    if (ref && href) links[ref] = href;
  }
  const directUrl = cleanString(entry.url ?? entry['prism:url']);
  if (directUrl) links.scopus = directUrl;
  return links;
};

const parseSearchAuthor = (value: unknown): ScopusAuthor => {
  const record = asRecord(value);
  const preferredName = asRecord(record['preferred-name']);
  const name = cleanString(record.authname ?? record.name ?? record['ce:indexed-name']);
  const givenName = cleanString(preferredName['given-name']);
  const surname = cleanString(preferredName.surname);
  const authorId = cleanString(record.authid ?? record['@_auid']);
  return { name, givenName, surname, authorId, affiliations: [], raw: record };
};
const parseAbstractAuthor = (value: unknown): ScopusAuthor => {
  const record = asRecord(value);
  const preferred = asRecord(record['preferred-name'] ?? record['ce:preferred-name']);
  const givenName = cleanString(preferred['given-name'] ?? record['given-name']);
  const surname = cleanString(preferred.surname ?? record.surname);
  const initials = cleanString(preferred.initials ?? record.initials);
  const name = [givenName, surname].filter(Boolean).join(' ') || cleanString(record.indexedName ?? record['ce:indexed-name']);
  const affiliationValues = findValues(record, ['afid', 'affiliation-id'])
    .map(cleanString)
    .filter((item): item is string => Boolean(item));
  return {
    name: name || undefined,
    givenName,
    surname,
    initials,
    authorId: cleanString(record.auid ?? record['@_auid'] ?? record.authorId),
    orcid: cleanString(record.orcid),
    affiliations: affiliationValues,
    raw: record,
  };
};

const parseAffiliations = (value: unknown): ScopusAffiliation[] => {
  const records = findValues(value, ['affiliation']).flatMap(asArray);
  return records.map((item) => {
    const record = asRecord(item);
    return {
      id: cleanString(record.afid ?? record['@_id'] ?? record.id),
      name: cleanString(record['affilname'] ?? record['organization'] ?? record['ce:affiliation-name'] ?? record.affilname),
      city: cleanString(record.city),
      country: cleanString(record['country'] ?? record['country-code']),
      raw: record,
    };
  }).filter((item) => item.id || item.name || item.city || item.country);
};

const getIdentifier = (entry: JsonRecord, prefix: string): string | undefined => {
  const identifier = cleanString(entry['dc:identifier'] ?? entry.identifier);
  if (identifier?.toUpperCase().startsWith(`${prefix}:`)) return identifier.slice(prefix.length + 1);
  return undefined;
};

export const parseSearchEntry = (entryValue: unknown, rank: number): ScopusResult => {
  const entry = rawRecord(entryValue);
  const authors = asArray(entry.author).map(parseSearchAuthor);
  const scopusId = getIdentifier(entry, 'SCOPUS_ID') ?? cleanString(entry['scopus-id']);
  const eid = cleanString(entry.eid) ?? getIdentifier(entry, 'EID');
  const doi = cleanString(entry['prism:doi'] ?? entry.doi);
  const citedByCount = numberValue(entry['citedby-count'] ?? entry.citedbyCount);
  return {
    rank,
    scopusId,
    eid,
    title: cleanString(entry['dc:title'] ?? entry.title),
    authors,
    affiliations: [],
    publication: {
      name: cleanString(entry['prism:publicationName'] ?? entry.publicationName),
      volume: cleanString(entry['prism:volume'] ?? entry.volume),
      issueIdentifier: cleanString(entry['prism:issueIdentifier'] ?? entry.issueIdentifier),
      pageRange: cleanString(entry['prism:pageRange'] ?? entry.pageRange),
      coverDate: cleanString(entry['prism:coverDate'] ?? entry.coverDate),
      publicationDate: cleanString(entry['prism:coverDisplayDate'] ?? entry.publicationDate),
      issn: cleanString(entry['prism:issn'] ?? entry.issn),
      isbn: cleanString(entry['prism:isbn'] ?? entry.isbn),
      publisher: cleanString(entry.publisher),
    },
    identifiers: { doi, pii: cleanString(entry['pii']), pubmedId: cleanString(entry['pubmed-id']), piiOrPui: cleanString(entry.pii) },
    metrics: { citedByCount, citationCount: citedByCount },
    access: {
      openAccess: cleanString(entry['openaccess']) === '1' || cleanString(entry['openaccessFlag']) === 'true',
      accessType: cleanString(entry['openaccessType']),
    },
    links: extractLinks(entry),
    hydration: { status: 'unavailable' },
    searchMetadata: entry,
  };
};

export const parseSearchPayload = (payload: unknown): { entries: ScopusResult[]; totalResults: number; raw: JsonRecord } => {
  const root = asRecord(payload);
  const searchResults = asRecord(root['search-results'] ?? root.searchResults ?? root);
  const entries = asArray(searchResults.entry).map((entry, index) => parseSearchEntry(entry, index + 1));
  return {
    entries,
    totalResults: firstNumber(searchResults, ['opensearch:totalResults', 'totalResults']) ?? entries.length,
    raw: searchResults,
  };
};

export const parseAbstractPayload = (payload: unknown, result: ScopusResult): ScopusResult => {
  const root = asRecord(payload);
  const title = firstString(root, ['dc:title', 'title']) ?? result.title;
  const abstractValue = findValues(root, ['dc:description', 'abstract', 'description'])[0];
  const abstract = textContent(abstractValue) || firstString(root, ['dc:description', 'abstract', 'description']);
  const authors = findValues(root, ['author'])
    .flatMap(asArray)
    .map(parseAbstractAuthor)
    .filter((author) => author.name || author.authorId);
  const affiliations = parseAffiliations(root);
  const citedByCount = firstNumber(root, ['citedby-count', 'citedByCount']);
  const mergedAuthors = authors.length ? authors : result.authors;
  return {
    ...result,
    title,
    abstract: abstract || undefined,
    authors: mergedAuthors,
    affiliations: affiliations.length ? affiliations : result.affiliations,
    publication: {
      ...result.publication,
      name: firstString(root, ['prism:publicationName', 'publicationName']) ?? result.publication.name,
      volume: firstString(root, ['prism:volume', 'volume']) ?? result.publication.volume,
      issueIdentifier: firstString(root, ['prism:issueIdentifier', 'issueIdentifier']) ?? result.publication.issueIdentifier,
      pageRange: firstString(root, ['prism:pageRange', 'pageRange']) ?? result.publication.pageRange,
      coverDate: firstString(root, ['prism:coverDate', 'coverDate']) ?? result.publication.coverDate,
      publicationDate: firstString(root, ['prism:coverDisplayDate', 'publicationDate']) ?? result.publication.publicationDate,
      issn: firstString(root, ['prism:issn', 'issn']) ?? result.publication.issn,
      isbn: firstString(root, ['prism:isbn', 'isbn']) ?? result.publication.isbn,
      publisher: firstString(root, ['publisher']) ?? result.publication.publisher,
    },
    identifiers: {
      ...result.identifiers,
      doi: firstString(root, ['prism:doi', 'doi']) ?? result.identifiers.doi,
      pii: firstString(root, ['pii']) ?? result.identifiers.pii,
      pubmedId: firstString(root, ['pubmed-id', 'pubmedId']) ?? result.identifiers.pubmedId,
    },
    metrics: { ...result.metrics, citedByCount: citedByCount ?? result.metrics.citedByCount, citationCount: citedByCount ?? result.metrics.citationCount },
    abstractMetadata: root,
  };
};
