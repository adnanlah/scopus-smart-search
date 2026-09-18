import type { WorkAffiliation, WorkAuthor, WorkResult } from '@openalex/shared';

type JsonRecord = Record<string, unknown>;

const asRecord = (value: unknown): JsonRecord =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};

const asArray = (value: unknown): unknown[] => Array.isArray(value) ? value : [];

const cleanString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const result = value.replace(/\s+/g, ' ').trim();
  return result || undefined;
};

const numberValue = (value: unknown): number | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return value;
};

const stripIdentifierUrl = (value: unknown): string | undefined => {
  const cleaned = cleanString(value);
  if (!cleaned) return undefined;
  return cleaned
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .replace(/^https?:\/\/orcid\.org\//i, '')
    .replace(/^https?:\/\/pubmed\.ncbi\.nlm\.nih\.gov\//i, '')
    .replace(/^https?:\/\/www\.ncbi\.nlm\.nih\.gov\/pmc\/articles\//i, '')
    .replace(/\/$/, '');
};

export const reconstructAbstract = (value: unknown): string | undefined => {
  const index = asRecord(value);
  const words: Array<[number, string]> = [];
  for (const [word, positionsValue] of Object.entries(index)) {
    for (const position of asArray(positionsValue)) {
      if (typeof position === 'number' && Number.isInteger(position) && position >= 0) words.push([position, word]);
    }
  }
  if (words.length === 0) return undefined;
  words.sort((left, right) => left[0] - right[0]);
  return words.map(([, word]) => word).join(' ');
};

const parseAuthor = (value: unknown): WorkAuthor => {
  const authorship = asRecord(value);
  const author = asRecord(authorship.author);
  const affiliations = asArray(authorship.institutions)
    .map((institution) => cleanString(asRecord(institution).id))
    .filter((id): id is string => Boolean(id));
  return {
    id: cleanString(author.id),
    name: cleanString(author.display_name),
    orcid: stripIdentifierUrl(author.orcid),
    affiliations,
    raw: authorship,
  };
};

const parseAffiliations = (authorships: unknown[]): WorkAffiliation[] => {
  const affiliations = new Map<string, WorkAffiliation>();
  for (const authorshipValue of authorships) {
    for (const institutionValue of asArray(asRecord(authorshipValue).institutions)) {
      const institution = asRecord(institutionValue);
      const id = cleanString(institution.id);
      const geo = asRecord(institution.geo);
      const name = cleanString(institution.display_name);
      const key = id ?? name;
      if (!key || affiliations.has(key)) continue;
      affiliations.set(key, {
        id,
        name,
        city: cleanString(geo.city),
        country: cleanString(geo.country_code),
        raw: institution,
      });
    }
  }
  return [...affiliations.values()];
};

const parsePageRange = (biblio: JsonRecord): string | undefined => {
  const firstPage = cleanString(biblio.first_page);
  const lastPage = cleanString(biblio.last_page);
  if (firstPage && lastPage) return firstPage === lastPage ? firstPage : `${firstPage}-${lastPage}`;
  return firstPage ?? lastPage;
};

export const parseWork = (value: unknown, rank: number): WorkResult => {
  const work = asRecord(value);
  const primaryLocation = asRecord(work.primary_location);
  const source = asRecord(primaryLocation.source);
  const openAccess = asRecord(work.open_access);
  const ids = asRecord(work.ids);
  const authorships = asArray(work.authorships);
  const openAlexId = cleanString(work.id);
  const doi = stripIdentifierUrl(work.doi ?? ids.doi);
  const pmid = stripIdentifierUrl(ids.pmid);
  const pmcid = stripIdentifierUrl(ids.pmcid);
  const oaUrl = cleanString(openAccess.oa_url);
  const landingPageUrl = cleanString(primaryLocation.landing_page_url);
  const pdfUrl = cleanString(primaryLocation.pdf_url);
  const links: Record<string, string> = {};
  if (openAlexId) links.openalex = openAlexId;
  if (doi) links.doi = `https://doi.org/${doi}`;
  if (oaUrl) links.oa = oaUrl;
  if (landingPageUrl) links.landing_page = landingPageUrl;
  if (pdfUrl) links.pdf = pdfUrl;

  return {
    rank,
    openAlexId,
    title: cleanString(work.display_name ?? work.title),
    abstract: reconstructAbstract(work.abstract_inverted_index),
    authors: authorships.map(parseAuthor).filter((author) => author.name || author.id),
    affiliations: parseAffiliations(authorships),
    publication: {
      name: cleanString(source.display_name),
      volume: cleanString(asRecord(work.biblio).volume),
      issueIdentifier: cleanString(asRecord(work.biblio).issue),
      pageRange: parsePageRange(asRecord(work.biblio)),
      coverDate: cleanString(work.publication_date),
      publicationDate: cleanString(work.publication_date),
      issn: cleanString(source.issn_l ?? asArray(source.issn).find((value) => typeof value === 'string')),
    },
    identifiers: { doi, pubmedId: pmid, pmcid },
    metrics: { citedByCount: numberValue(work.cited_by_count) },
    access: {
      openAccess: openAccess.is_oa === true,
      accessType: cleanString(openAccess.oa_status),
      license: cleanString(primaryLocation.license),
    },
    links,
    searchMetadata: work,
  };
};
