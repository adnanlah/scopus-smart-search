import type { WorkAffiliation, WorkAuthor, WorkLocation, WorkResult, WorkTopic } from '@openalex/shared';

type JsonRecord = Record<string, unknown>;

const asRecord = (value: unknown): JsonRecord =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};

const asArray = (value: unknown): unknown[] => Array.isArray(value) ? value : [];

const cleanString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const result = value.replace(/\s+/g, ' ').trim();
  return result || undefined;
};

const httpsUrl = (value: unknown): string | undefined => {
  const candidate = cleanString(value);
  if (!candidate) return undefined;
  try {
    const url = new URL(candidate);
    return url.protocol === 'https:' ? url.toString().replace(/\/$/, '') : undefined;
  } catch {
    return undefined;
  }
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
    .replace(/^https?:\/\/ror\.org\//i, '')
    .replace(/^https?:\/\/pubmed\.ncbi\.nlm\.nih\.gov\//i, '')
    .replace(/^https?:\/\/www\.ncbi\.nlm\.nih\.gov\/pmc\/articles\//i, '')
    .replace(/^https?:\/\/arxiv\.org\/(?:abs|pdf)\//i, '')
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
  const institutions = asArray(authorship.institutions);
  const affiliations = institutions
    .map((institution) => cleanString(asRecord(institution).id))
    .filter((id): id is string => Boolean(id));
  const countries = [
    ...asArray(authorship.countries),
    ...institutions.map((institution) => asRecord(institution).country_code),
  ]
    .map(cleanString)
    .filter((country): country is string => Boolean(country));
  const position = cleanString(authorship.author_position);
  const authorId = httpsUrl(author.id);
  const orcid = stripIdentifierUrl(author.orcid);
  const links: Record<string, string> = {};
  if (authorId) links.openalex = authorId;
  if (orcid) links.orcid = `https://orcid.org/${orcid}`;
  return {
    id: authorId ?? cleanString(author.id),
    name: cleanString(author.display_name),
    orcid,
    ...(Object.keys(links).length > 0 ? { links } : {}),
    position: position === 'first' || position === 'middle' || position === 'last' ? position : undefined,
    corresponding: typeof authorship.is_corresponding === 'boolean' ? authorship.is_corresponding : undefined,
    countries: [...new Set(countries)],
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
      const ror = stripIdentifierUrl(institution.ror);
      const geo = asRecord(institution.geo);
      const name = cleanString(institution.display_name);
      const key = id ?? name;
      if (!key || affiliations.has(key)) continue;
      const links: Record<string, string> = {};
      if (httpsUrl(id)) links.openalex = httpsUrl(id)!;
      if (ror) links.ror = `https://ror.org/${ror}`;
      affiliations.set(key, {
        id,
        name,
        ror,
        city: cleanString(geo.city),
        country: cleanString(institution.country_code ?? geo.country_code),
        ...(Object.keys(links).length > 0 ? { links } : {}),
        raw: institution,
      });
    }
  }
  return [...affiliations.values()];
};

const parseTopic = (value: unknown): WorkTopic | undefined => {
  const topic = asRecord(value);
  const name = cleanString(topic.display_name);
  if (!name) return undefined;
  const id = httpsUrl(topic.id);
  const topicIds = asRecord(topic.ids);
  const wikipedia = httpsUrl(topicIds.wikipedia ?? topic.wikipedia);
  const links: Record<string, string> = {};
  if (id) links.openalex = id;
  if (wikipedia) links.wikipedia = wikipedia;
  return {
    ...(id ? { id } : {}),
    name,
    subfield: cleanString(asRecord(topic.subfield).display_name),
    field: cleanString(asRecord(topic.field).display_name),
    domain: cleanString(asRecord(topic.domain).display_name),
    ...(Object.keys(links).length > 0 ? { links } : {}),
  };
};

const parseLocation = (value: unknown, isPrimary: boolean): WorkLocation | undefined => {
  const location = asRecord(value);
  const source = asRecord(location.source);
  const landingPageUrl = httpsUrl(location.landing_page_url);
  const pdfUrl = httpsUrl(location.pdf_url);
  if (!landingPageUrl && !pdfUrl) return undefined;
  const links: Record<string, string> = {};
  if (landingPageUrl) links.landing_page = landingPageUrl;
  if (pdfUrl) links.pdf = pdfUrl;
  const sourceId = httpsUrl(source.id);
  const homepageUrl = httpsUrl(source.homepage_url);
  if (sourceId) links.source = sourceId;
  if (homepageUrl) links.source_homepage = homepageUrl;
  return {
    sourceName: cleanString(source.display_name),
    sourceType: cleanString(source.type),
    version: cleanString(location.version),
    landingPageUrl,
    pdfUrl,
    isPrimary,
    isOpenAccess: typeof location.is_oa === 'boolean' ? location.is_oa : undefined,
    links,
  };
};

const parseLocations = (work: JsonRecord): WorkLocation[] => {
  const candidates = [
    parseLocation(work.primary_location, true),
    parseLocation(work.best_oa_location, false),
  ].filter((location): location is WorkLocation => Boolean(location));
  const unique = new Map<string, WorkLocation>();
  for (const location of candidates) {
    const key = location.landingPageUrl ?? location.pdfUrl;
    if (!key) continue;
    const existing = unique.get(key);
    if (!existing) {
      unique.set(key, location);
      continue;
    }
    unique.set(key, {
      ...existing,
      isPrimary: existing.isPrimary || location.isPrimary,
      isOpenAccess: existing.isOpenAccess || location.isOpenAccess,
      links: { ...existing.links, ...location.links },
    });
  }
  return [...unique.values()];
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
  const openAlexId = httpsUrl(work.id) ?? cleanString(work.id);
  const doi = stripIdentifierUrl(work.doi ?? ids.doi);
  const pmid = stripIdentifierUrl(ids.pmid);
  const pmcid = stripIdentifierUrl(ids.pmcid);
  const arxiv = stripIdentifierUrl(ids.arxiv);
  const oaUrl = httpsUrl(openAccess.oa_url);
  const landingPageUrl = httpsUrl(primaryLocation.landing_page_url);
  const pdfUrl = httpsUrl(primaryLocation.pdf_url);
  const sourceIssns = asArray(source.issn)
    .map(cleanString)
    .filter((issn): issn is string => Boolean(issn));
  const issnL = cleanString(source.issn_l);
  const links: Record<string, string> = {};
  if (openAlexId) links.openalex = openAlexId;
  if (doi) links.doi = `https://doi.org/${doi}`;
  if (pmid) links.pubmed = `https://pubmed.ncbi.nlm.nih.gov/${pmid}`;
  if (pmcid) links.pmc = `https://www.ncbi.nlm.nih.gov/pmc/articles/${pmcid}`;
  if (arxiv) links.arxiv = `https://arxiv.org/abs/${arxiv}`;
  if (oaUrl) links.oa = oaUrl;
  if (landingPageUrl) links.landing_page = landingPageUrl;
  if (pdfUrl) links.pdf = pdfUrl;

  const sourceLinks: Record<string, string> = {};
  const sourceId = httpsUrl(source.id);
  const sourceHomepage = httpsUrl(source.homepage_url);
  const publisherId = httpsUrl(source.host_organization);
  if (sourceId) sourceLinks.openalex = sourceId;
  if (sourceHomepage) sourceLinks.homepage = sourceHomepage;
  if (publisherId) sourceLinks.publisher = publisherId;

  return {
    rank,
    openAlexId,
    title: cleanString(work.display_name ?? work.title),
    abstract: reconstructAbstract(work.abstract_inverted_index),
    workType: cleanString(work.type),
    language: cleanString(work.language),
    topics: asArray(work.topics).map(parseTopic).filter((topic): topic is WorkTopic => Boolean(topic)),
    keywords: asArray(work.keywords)
      .map((keyword) => cleanString(asRecord(keyword).display_name))
      .filter((keyword): keyword is string => Boolean(keyword)),
    indexedIn: asArray(work.indexed_in).map(cleanString).filter((index): index is string => Boolean(index)),
    isRetracted: typeof work.is_retracted === 'boolean' ? work.is_retracted : undefined,
    authors: authorships.map(parseAuthor).filter((author) => author.name || author.id),
    affiliations: parseAffiliations(authorships),
    publication: {
      name: cleanString(source.display_name),
      sourceType: cleanString(source.type),
      volume: cleanString(asRecord(work.biblio).volume),
      issueIdentifier: cleanString(asRecord(work.biblio).issue),
      pageRange: parsePageRange(asRecord(work.biblio)),
      coverDate: cleanString(work.publication_date),
      publicationDate: cleanString(work.publication_date),
      issn: issnL ?? sourceIssns[0],
      issnL,
      ...(sourceIssns.length > 0 ? { issns: sourceIssns } : {}),
      publisher: cleanString(source.host_organization_name),
      ...(Object.keys(sourceLinks).length > 0 ? { links: sourceLinks } : {}),
    },
    identifiers: { doi, pubmedId: pmid, pmcid, arxiv },
    metrics: { citedByCount: numberValue(work.cited_by_count) },
    access: {
      openAccess: typeof openAccess.is_oa === 'boolean' ? openAccess.is_oa : undefined,
      accessType: cleanString(openAccess.oa_status),
      license: cleanString(primaryLocation.license),
    },
    locations: parseLocations(work),
    links,
    searchMetadata: work,
  };
};
