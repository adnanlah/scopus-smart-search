import type { WorkResult } from '@openalex/shared';

const MAX_JEV_TOPICS = 3;
const MAX_JEV_KEYWORDS = 5;
const MAX_JEV_CORRESPONDING_AUTHORS = 6;

interface JevTopicState {
  name: string;
  subfield?: string;
  field?: string;
  domain?: string;
}

interface JevAuthorState {
  name: string;
  position?: 'first' | 'middle' | 'last';
  corresponding?: boolean;
  institutions?: string[];
  countries?: string[];
}

interface JevAuthorshipState {
  available_author_count: number;
  sampled_authors: JevAuthorState[];
  sampled: boolean;
}

interface JevSourceState {
  name?: string;
  type?: string;
  publisher?: string;
  issn?: string;
}

interface JevAccessState {
  open_access?: boolean;
  status?: string;
  license?: string;
  indexed_in?: string[];
}

export interface JevPaperState {
  title?: string;
  abstract?: string;
  work_type?: string;
  language?: string;
  publication_date?: string;
  topics?: JevTopicState[];
  keywords?: string[];
  authorship?: JevAuthorshipState;
  source?: JevSourceState;
  access?: JevAccessState;
  is_retracted?: boolean;
}

const cleanText = (value: string | undefined): string | undefined => {
  const cleaned = value?.replace(/\s+/g, ' ').trim();
  return cleaned || undefined;
};

const uniqueStrings = (values: Array<string | undefined>): string[] =>
  [...new Set(values.map(cleanText).filter((value): value is string => Boolean(value)))];

const buildTopicState = (
  topic: NonNullable<WorkResult['topics']>[number],
): JevTopicState | undefined => {
  const name = cleanText(topic.name);
  if (!name) return undefined;
  const subfield = cleanText(topic.subfield);
  const field = cleanText(topic.field);
  const domain = cleanText(topic.domain);
  return {
    name,
    ...(subfield ? { subfield } : {}),
    ...(field ? { field } : {}),
    ...(domain ? { domain } : {}),
  };
};

const buildAuthorshipState = (work: WorkResult): JevAuthorshipState | undefined => {
  const namedAuthors = work.authors.filter((author) => cleanText(author.name));
  if (namedAuthors.length === 0) return undefined;

  const firstIndex = Math.max(0, namedAuthors.findIndex((author) => author.position === 'first'));
  let lastIndex = namedAuthors.length - 1;
  for (let index = namedAuthors.length - 1; index >= 0; index -= 1) {
    if (namedAuthors[index]?.position === 'last') {
      lastIndex = index;
      break;
    }
  }
  const correspondingIndexes = namedAuthors
    .map((author, index) => ({ author, index }))
    .filter(({ author }) => author.corresponding)
    .slice(0, MAX_JEV_CORRESPONDING_AUTHORS)
    .map(({ index }) => index);
  const representativeIndexes = [...new Set([firstIndex, ...correspondingIndexes, lastIndex])]
    .sort((left, right) => left - right);

  const affiliationsById = new Map(
    work.affiliations
      .filter((affiliation) => affiliation.id)
      .map((affiliation) => [affiliation.id!, affiliation]),
  );
  const seenAuthors = new Set<string>();
  const sampledAuthors = representativeIndexes.flatMap((index): JevAuthorState[] => {
    const author = namedAuthors[index];
    const name = cleanText(author?.name);
    if (!author || !name) return [];
    const identity = author.id ?? name.toLocaleLowerCase();
    if (seenAuthors.has(identity)) return [];
    seenAuthors.add(identity);

    const affiliations = author.affiliations
      .map((id) => affiliationsById.get(id))
      .filter((affiliation) => Boolean(affiliation));
    const institutions = uniqueStrings(affiliations.map((affiliation) => affiliation?.name));
    const countries = uniqueStrings([
      ...(author.countries ?? []),
      ...affiliations.map((affiliation) => affiliation?.country),
    ]);
    return [{
      name,
      ...(author.position ? { position: author.position } : {}),
      ...(typeof author.corresponding === 'boolean' ? { corresponding: author.corresponding } : {}),
      ...(institutions.length > 0 ? { institutions } : {}),
      ...(countries.length > 0 ? { countries } : {}),
    }];
  });

  return {
    available_author_count: work.authors.length,
    sampled_authors: sampledAuthors,
    sampled: sampledAuthors.length < work.authors.length,
  };
};

export const buildJevPaperState = (work: WorkResult): JevPaperState => {
  const title = cleanText(work.title);
  const abstract = cleanText(work.abstract);
  const workType = cleanText(work.workType);
  const language = cleanText(work.language);
  const publicationDate = cleanText(work.publication.publicationDate ?? work.publication.coverDate);
  const topics = (work.topics ?? [])
    .slice(0, MAX_JEV_TOPICS)
    .map(buildTopicState)
    .filter((topic): topic is JevTopicState => Boolean(topic));
  const keywords = uniqueStrings((work.keywords ?? []).slice(0, MAX_JEV_KEYWORDS));
  const authorship = buildAuthorshipState(work);
  const sourceName = cleanText(work.publication.name);
  const sourceType = cleanText(work.publication.sourceType);
  const publisher = cleanText(work.publication.publisher);
  const issn = cleanText(work.publication.issn);
  const source: JevSourceState = {
    ...(sourceName ? { name: sourceName } : {}),
    ...(sourceType ? { type: sourceType } : {}),
    ...(publisher ? { publisher } : {}),
    ...(issn ? { issn } : {}),
  };
  const indexedIn = uniqueStrings(work.indexedIn ?? []);
  const accessStatus = cleanText(work.access.accessType);
  const license = cleanText(work.access.license);
  const access: JevAccessState = {
    ...(typeof work.access.openAccess === 'boolean' ? { open_access: work.access.openAccess } : {}),
    ...(accessStatus ? { status: accessStatus } : {}),
    ...(license ? { license } : {}),
    ...(indexedIn.length > 0 ? { indexed_in: indexedIn } : {}),
  };

  return {
    ...(title ? { title } : {}),
    ...(abstract ? { abstract } : {}),
    ...(workType ? { work_type: workType } : {}),
    ...(language ? { language } : {}),
    ...(publicationDate ? { publication_date: publicationDate } : {}),
    ...(topics.length > 0 ? { topics } : {}),
    ...(keywords.length > 0 ? { keywords } : {}),
    ...(authorship ? { authorship } : {}),
    ...(Object.keys(source).length > 0 ? { source } : {}),
    ...(Object.keys(access).length > 0 ? { access } : {}),
    ...(typeof work.isRetracted === 'boolean' ? { is_retracted: work.isRetracted } : {}),
  };
};
