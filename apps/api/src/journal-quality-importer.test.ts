import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import XLSX from 'xlsx';
import { afterEach, describe, expect, it } from 'vitest';
import { buildJournalRankingDataset, readSJRRows } from './journal-quality-importer.js';

const temporaryFiles: string[] = [];

afterEach(() => {
  for (const file of temporaryFiles.splice(0)) {
    if (fs.existsSync(file)) fs.rmSync(file, { force: true, recursive: true });
  }
});

describe('journal ranking importer', () => {
  it('imports SCImago rows directly through ISSN and preserves years and categories', () => {
    const dataset = buildJournalRankingDataset([
      { issn: '1234-5678', sjrbestquartile: 'Q1', year: 2024, sjr: 1.2, subjectarea: 'Computer Science' },
      { issnl: '12345678', quartile: 'Q2', metricyear: 2023, sjr: 0.9, subjectcategory: 'Information Systems' },
    ]);

    expect(dataset.source).toBe('SCImago SJR');
    expect(dataset.entries).toHaveLength(1);
    expect(dataset.entries[0]).toMatchObject({
      identifiers: ['12345678'],
      metrics: [
        { metricYear: 2024, quartile: 'Q1', sjr: 1.2, subjectArea: 'Computer Science' },
        { metricYear: 2023, quartile: 'Q2', sjr: 0.9, subjectArea: 'Information Systems' },
      ],
    });
  });

  it('reads SCImago CSV exports, infers the release year, parses decimal commas, and skips unranked rows', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sjr-import-'));
    const file = path.join(directory, 'scimagojr 2025.csv');
    temporaryFiles.push(file, directory);
    fs.writeFileSync(file, [
      'Rank;Issn;SJR;SJR Best Quartile;Categories',
      '1;1234-5678, 8765-4321;1,234;Q1;Computer Science (Q1)',
      '2;12345678;0,9;Q2;Information Systems (Q2)',
      '3;1111-1111;;-;Unranked',
    ].join('\n'), 'utf8');

    const dataset = buildJournalRankingDataset(readSJRRows(file));

    expect(dataset.entries).toHaveLength(1);
    expect(dataset.entries[0]).toMatchObject({
      identifiers: ['12345678', '87654321'],
      metrics: [
        { metricYear: 2025, quartile: 'Q1', sjr: 1.234, subjectArea: 'Computer Science (Q1)' },
        { metricYear: 2025, quartile: 'Q2', sjr: 0.9, subjectArea: 'Information Systems (Q2)' },
      ],
    });
  });

  it('merges duplicate identifier groups when rows overlap through different ISSNs', () => {
    const dataset = buildJournalRankingDataset([
      { issn: '1234-5678', quartile: 'Q1', year: 2024 },
      { issn: '1234-5678, 8765-4321', quartile: 'Q2', year: 2024 },
      { issn: '8765-4321', quartile: 'Q3', year: 2023 },
    ]);

    expect(dataset.entries).toHaveLength(1);
    expect(dataset.entries[0]?.identifiers).toEqual(['12345678', '87654321']);
    expect(dataset.entries[0]?.metrics).toHaveLength(3);
  });

  it('rejects rows without valid identifier, quartile, or year data', () => {
    expect(() => buildJournalRankingDataset([
      { issn: '1234-5678', quartile: 'Q1', year: 2024 },
      { issn: '', quartile: 'Q2', year: 2024 },
    ])).toThrow(/missing a valid ISSN or ISSN-L/i);
    expect(() => buildJournalRankingDataset([
      { issn: '1234-5678', quartile: 'Q5', year: 2024 },
    ])).toThrow(/missing a valid SJR quartile/i);
    expect(() => buildJournalRankingDataset([
      { issn: '1234-5678', quartile: 'Q1', year: 'unknown' },
    ])).toThrow(/missing a valid metric year/i);
  });

  it('rejects exports without the required SJR columns', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sjr-import-'));
    const file = path.join(directory, 'invalid.xlsx');
    temporaryFiles.push(file, directory);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ['Title', 'SJR'],
      ['Example Journal', 1.2],
    ]), 'Sheet1');
    XLSX.writeFile(workbook, file);

    expect(() => readSJRRows(file)).toThrow(/could not find SJR columns/i);
  });
});
