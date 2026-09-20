import { readFileSync } from 'node:fs';
import type {
  JournalQuality,
  JournalQuartile,
  JournalRanking,
  WorkResult,
} from '@openalex/shared';

export interface SJRMetric {
  metricYear: number;
  quartile: JournalQuartile;
  sjr?: number;
  subjectArea?: string;
}

export interface JournalRankingEntry {
  title?: string;
  identifiers: string[];
  metrics: SJRMetric[];
}

export interface JournalRankingDataset {
  version: 1;
  source: string;
  generatedAt?: string;
  entries: JournalRankingEntry[];
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

const asArray = (value: unknown): unknown[] => Array.isArray(value) ? value : [];

const parseMetric = (value: unknown): SJRMetric | undefined => {
  const record = asRecord(value);
  const metricYear = typeof record.metricYear === 'number' ? record.metricYear : Number(record.metricYear);
  const quartile = normalizeQuartile(record.quartile);
  if (!Number.isInteger(metricYear) || !quartile) return undefined;
  const sjr = typeof record.sjr === 'number' && Number.isFinite(record.sjr) ? record.sjr : undefined;
  const subjectArea = typeof record.subjectArea === 'string' && record.subjectArea.trim() ? record.subjectArea.trim() : undefined;
  return { metricYear, quartile, ...(sjr === undefined ? {} : { sjr }), ...(subjectArea ? { subjectArea } : {}) };
};

export const parseJournalRankingDataset = (value: unknown): JournalRankingDataset => {
  const record = asRecord(value);
  if (record.version !== 1 || typeof record.source !== 'string') {
    throw new Error('Journal ranking data must have version 1 and a source name.');
  }
  const entries = asArray(record.entries).flatMap((entryValue): JournalRankingEntry[] => {
    const entry = asRecord(entryValue);
    const identifiers = asArray(entry.identifiers)
      .map(normalizeIssn)
      .filter((identifier): identifier is string => Boolean(identifier));
    const metrics = asArray(entry.metrics)
      .map(parseMetric)
      .filter((metric): metric is SJRMetric => Boolean(metric));
    if (identifiers.length === 0 || metrics.length === 0) return [];
    const title = typeof entry.title === 'string' && entry.title.trim() ? entry.title.trim() : undefined;
    return [{ identifiers: [...new Set(identifiers)], metrics, ...(title ? { title } : {}) }];
  });
  return {
    version: 1,
    source: record.source,
    ...(typeof record.generatedAt === 'string' ? { generatedAt: record.generatedAt } : {}),
    entries,
  };
};

export const loadJournalRankingIndex = (filePath: string): JournalRankingIndex => {
  const raw = readFileSync(filePath, 'utf8');
  return new JournalRankingIndex(parseJournalRankingDataset(JSON.parse(raw) as unknown));
};

export const normalizeIssn = (value: unknown): string | undefined => {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const normalized = String(value).toUpperCase().replace(/[\s-]/gu, '');
  return /^[0-9]{7}[0-9X]$/u.test(normalized) ? normalized : undefined;
};

export const normalizeQuartile = (value: unknown): JournalQuartile | undefined => {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const normalized = String(value).trim().toUpperCase().replace(/\s+/gu, '');
  const match = normalized.match(/^(?:Q|QUARTILE)?([1-4])$/u);
  return match?.[1] ? `Q${match[1]}` as JournalQuartile : undefined;
};

const quartileOrder = (quartile: JournalQuartile): number => Number(quartile.slice(1));

const compareMetrics = (left: SJRMetric, right: SJRMetric): number =>
  right.metricYear - left.metricYear
  || quartileOrder(left.quartile) - quartileOrder(right.quartile)
  || (right.sjr ?? Number.NEGATIVE_INFINITY) - (left.sjr ?? Number.NEGATIVE_INFINITY);

const sourceIsJournal = (work: WorkResult): boolean => work.publication.sourceType?.toLocaleLowerCase() === 'journal';

const workIdentifiers = (work: WorkResult): string[] => [
  work.publication.issnL,
  work.publication.issn,
  ...(work.publication.issns ?? []),
]
  .map(normalizeIssn)
  .filter((value): value is string => Boolean(value));

export class JournalRankingIndex {
  private readonly metricsByIdentifier = new Map<string, SJRMetric[]>();

  public constructor(dataset: JournalRankingDataset) {
    for (const entry of dataset.entries) {
      const metrics = entry.metrics.filter((metric) => (
        Number.isInteger(metric.metricYear)
        && metric.metricYear >= 1900
        && metric.metricYear <= 2200
        && Boolean(normalizeQuartile(metric.quartile))
      ));
      for (const identifier of entry.identifiers.map(normalizeIssn).filter((value): value is string => Boolean(value))) {
        const existing = this.metricsByIdentifier.get(identifier) ?? [];
        this.metricsByIdentifier.set(identifier, [...existing, ...metrics]);
      }
    }
  }

  public find(work: WorkResult, predicate: (metric: SJRMetric) => boolean = () => true): JournalRanking | undefined {
    const metrics = [...new Map(
      workIdentifiers(work)
        .flatMap((identifier) => this.metricsByIdentifier.get(identifier) ?? [])
        .filter(predicate)
        .map((metric) => [
          `${metric.metricYear}:${metric.quartile}:${metric.subjectArea ?? ''}:${metric.sjr ?? ''}`,
          metric,
        ] as const),
    ).values()].sort(compareMetrics);
    const metric = metrics[0];
    if (!metric) return undefined;
    return {
      status: 'ranked',
      quartile: metric.quartile,
      ...(metric.sjr === undefined ? {} : { sjr: metric.sjr }),
      metricYear: metric.metricYear,
    };
  }
}

export const emptyJournalRankingIndex = (): JournalRankingIndex => new JournalRankingIndex({
  version: 1,
  source: 'empty',
  entries: [],
});

export const journalQualityRequiresLocalFiltering = (quality: JournalQuality): boolean => quality !== 'any';

export const qualifiesForJournalQuality = (
  work: WorkResult,
  quality: JournalQuality,
  index: JournalRankingIndex,
): boolean => {
  if (quality === 'any') return true;
  if (!sourceIsJournal(work)) return false;
  if (quality === 'include-unranked') return true;

  const ranking = quality === 'ranked'
    ? index.find(work)
    : index.find(work, (metric) => quality === 'q1'
      ? metric.quartile === 'Q1'
      : metric.quartile === 'Q1' || metric.quartile === 'Q2');
  return Boolean(ranking?.quartile);
};

const rankingForQuality = (work: WorkResult, quality: JournalQuality, index: JournalRankingIndex): JournalRanking | undefined => {
  if (quality === 'ranked' || quality === 'include-unranked') return index.find(work);
  if (quality === 'q1') return index.find(work, (metric) => metric.quartile === 'Q1');
  return index.find(work, (metric) => metric.quartile === 'Q1' || metric.quartile === 'Q2');
};

export const applyJournalQuality = (
  works: WorkResult[],
  quality: JournalQuality,
  index: JournalRankingIndex,
): { results: WorkResult[]; eligibleResults?: number } => {
  if (!journalQualityRequiresLocalFiltering(quality)) {
    return {
      results: works.map((work) => {
        const ranking = sourceIsJournal(work) ? index.find(work) : undefined;
        return ranking ? { ...work, journalRanking: ranking } : work;
      }),
    };
  }

  const results = works
    .filter((work) => qualifiesForJournalQuality(work, quality, index))
    .map((work) => {
      if (!sourceIsJournal(work)) return work;
      return {
        ...work,
        journalRanking: rankingForQuality(work, quality, index) ?? { status: 'unranked' },
      };
    });
  return { results, eligibleResults: results.length };
};
