import fs from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';
import {
  normalizeIssn,
  normalizeQuartile,
  type JournalRankingDataset,
  type JournalRankingEntry,
  type SJRMetric,
} from './journal-quality.js';

export type Cell = string | number | boolean | Date | null | undefined;
export type RankingRow = Record<string, Cell>;

const normalizeHeader = (value: unknown): string => String(value ?? '')
  .normalize('NFKC')
  .toLowerCase()
  .replace(/[^a-z0-9]/gu, '');

const splitIdentifiers = (value: unknown): string[] => String(value ?? '')
  .split(/[;,|\s]+/u)
  .map(normalizeIssn)
  .filter((identifier): identifier is string => Boolean(identifier));

const identifierAliases = ['issn', 'issnl', 'issns', 'eissn', 'issne', 'issnprint', 'issnelectronic'];
const quartileAliases = ['sjrbestquartile', 'bestquartile', 'quartile', 'sjrquartile'];
const yearAliases = ['year', 'sjryear', 'metricyear', 'rankingyear'];
const subjectAliases = ['subjectarea', 'subjectcategory', 'category', 'categories', 'asjc'];

const valuesFor = (row: RankingRow, aliases: string[]): Cell[] => aliases
  .map((alias) => row[alias])
  .filter((value) => value !== undefined && value !== null && String(value).trim() !== '');

const splitRowIdentifiers = (row: RankingRow): string[] => [...new Set(
  valuesFor(row, identifierAliases).flatMap(splitIdentifiers),
)];

const firstValue = (row: RankingRow, aliases: string[]): Cell => valuesFor(row, aliases)[0] ?? null;

const parseYear = (value: unknown): number | undefined => {
  const year = Number(String(value ?? '').trim());
  return Number.isInteger(year) && year >= 1900 && year <= 2200 ? year : undefined;
};

const parseOptionalNumber = (value: unknown): number | undefined => {
  if (value === undefined || value === null || String(value).trim() === '') return undefined;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const normalized = String(value).trim().replace(/\s/gu, '');
  const lastComma = normalized.lastIndexOf(',');
  const lastDot = normalized.lastIndexOf('.');
  const decimalNormalized = lastComma > lastDot
    ? normalized.replace(/\./gu, '').replace(',', '.')
    : normalized.replace(/,/gu, '');
  const parsed = Number(decimalNormalized);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const hasContent = (row: RankingRow): boolean => Object.values(row)
  .some((value) => value !== null && value !== undefined && String(value).trim() !== '');

const findHeaderRow = (rows: Cell[][]): number => {
  for (let index = 0; index < Math.min(rows.length, 50); index += 1) {
    const headers = new Set((rows[index] ?? []).map(normalizeHeader));
    const hasIdentifier = identifierAliases.some((alias) => headers.has(alias));
    const hasQuartile = quartileAliases.some((alias) => headers.has(alias));
    if (hasIdentifier && hasQuartile) return index;
  }
  return -1;
};

const extractYear = (value: unknown): number | undefined => {
  const match = String(value ?? '').match(/(?:^|[^0-9])((?:19|20|21|22)[0-9]{2})(?:[^0-9]|$)/u);
  return match?.[1] ? parseYear(match[1]) : undefined;
};

const inferMetricYear = (filePath: string, headers: unknown[]): number | undefined => {
  const headerYear = headers.map(extractYear).find((year): year is number => year !== undefined);
  if (headerYear) return headerYear;
  return extractYear(path.basename(filePath));
};

export const readSJRRows = (filePath: string): RankingRow[] => {
  const workbook = XLSX.readFile(filePath, { cellDates: true });
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    // Keep formatted CSV cells as text so SCImago's comma decimal separator is
    // not mistaken for a thousands separator by the XLSX parser.
    const rows = XLSX.utils.sheet_to_json<Cell[]>(sheet, { header: 1, defval: null, raw: false });
    const headerIndex = findHeaderRow(rows);
    if (headerIndex < 0) continue;
    const headers = (rows[headerIndex] ?? []).map((header, index) => normalizeHeader(header) || `column${index}`);
    const metricYear = yearAliases.some((alias) => headers.includes(alias))
      ? undefined
      : inferMetricYear(filePath, rows[headerIndex] ?? []);
    if (!yearAliases.some((alias) => headers.includes(alias)) && !metricYear) {
      throw new Error(`Could not find SJR metric year in ${filePath}; provide a year column or a year in the export name.`);
    }
    return rows.slice(headerIndex + 1).map((values) => Object.fromEntries(
      headers.map((header, index) => [header, values[index] ?? null]),
    )).map((row) => metricYear === undefined || row.year !== null && row.year !== undefined && String(row.year).trim() !== ''
      ? row
      : { ...row, year: metricYear });
  }
  throw new Error(`Could not find SJR columns (ISSN/ISSN-L and quartile) in ${filePath}.`);
};

const invalidRowError = (rowNumber: number, reason: string): Error =>
  new Error(`Invalid SCImago SJR row ${rowNumber}: ${reason}.`);

const isUnrankedQuartileMarker = (value: unknown): boolean => {
  const normalized = String(value ?? '').trim().toUpperCase();
  return normalized === '-' || normalized === '—';
};

const isMissingIdentifierMarker = (value: unknown): boolean => {
  const normalized = String(value ?? '').trim().toUpperCase();
  return normalized === '-' || normalized === '—';
};

export const buildJournalRankingDataset = (rows: RankingRow[]): JournalRankingDataset => {
  const entries: JournalRankingEntry[] = [];
  const entryByIdentifier = new Map<string, JournalRankingEntry>();

  rows.forEach((row, index) => {
    if (!hasContent(row)) return;
    const rowNumber = index + 2;
    const identifiers = splitRowIdentifiers(row);
    if (identifiers.length === 0) {
      const identifierValues = valuesFor(row, identifierAliases);
      if (identifierValues.length > 0 && identifierValues.every(isMissingIdentifierMarker)) return;
      throw invalidRowError(rowNumber, 'missing a valid ISSN or ISSN-L');
    }

    const rawQuartile = firstValue(row, quartileAliases);
    if (isUnrankedQuartileMarker(rawQuartile)) return;
    const quartile = normalizeQuartile(rawQuartile);
    if (!quartile) throw invalidRowError(rowNumber, 'missing a valid SJR quartile');

    const metricYear = parseYear(firstValue(row, yearAliases));
    if (!metricYear) throw invalidRowError(rowNumber, 'missing a valid metric year');

    const rawSjr = firstValue(row, ['sjr', 'scimagojournalrank', 'sjrvalue']);
    const sjr = parseOptionalNumber(rawSjr);
    if (rawSjr !== null && rawSjr !== undefined && String(rawSjr).trim() !== '' && sjr === undefined) {
      throw invalidRowError(rowNumber, 'contains an invalid numeric SJR value');
    }

    const subjectAreaValue = firstValue(row, subjectAliases);
    const subjectArea = subjectAreaValue === null ? undefined : String(subjectAreaValue).trim() || undefined;
    const metric: SJRMetric = {
      metricYear,
      quartile,
      ...(sjr === undefined ? {} : { sjr }),
      ...(subjectArea ? { subjectArea } : {}),
    };
    const matchingEntries = [...new Set(identifiers
      .map((identifier) => entryByIdentifier.get(identifier))
      .filter((entry): entry is JournalRankingEntry => Boolean(entry)))];
    const current = matchingEntries[0] ?? { identifiers: [], metrics: [] };
    if (matchingEntries.length === 0) entries.push(current);
    for (const duplicate of matchingEntries.slice(1)) {
      current.identifiers.push(...duplicate.identifiers);
      current.metrics.push(...duplicate.metrics);
      entries.splice(entries.indexOf(duplicate), 1);
    }
    current.identifiers = [...new Set([...current.identifiers, ...identifiers])];
    current.metrics.push(metric);
    for (const identifier of current.identifiers) entryByIdentifier.set(identifier, current);
  });

  if (entries.length === 0) throw new Error('The SCImago SJR export contains no ranking rows.');
  return {
    version: 1,
    source: 'SCImago SJR',
    generatedAt: new Date().toISOString(),
    entries: entries.map((entry) => ({
      ...entry,
      metrics: [...new Map(entry.metrics.map((metric) => [
        `${metric.metricYear}:${metric.quartile}:${metric.subjectArea ?? ''}:${metric.sjr ?? ''}`,
        metric,
      ])).values()],
    })),
  };
};

export const importJournalRankings = (sjrExportPath: string, outputPath: string): JournalRankingDataset => {
  const dataset = buildJournalRankingDataset(readSJRRows(sjrExportPath));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(dataset, null, 2)}\n`, 'utf8');
  return dataset;
};
