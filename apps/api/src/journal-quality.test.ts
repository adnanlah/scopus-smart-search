import { describe, expect, it } from 'vitest';
import type { WorkResult } from '@openalex/shared';
import {
  applyJournalQuality,
  JournalRankingIndex,
  normalizeIssn,
  normalizeQuartile,
  parseJournalRankingDataset,
} from './journal-quality.js';

const work = (issnL: string, sourceType = 'journal'): WorkResult => ({
  rank: 1,
  title: 'Test work',
  authors: [],
  affiliations: [],
  publication: { name: 'Test Journal', sourceType, issnL, issn: issnL },
  identifiers: {},
  metrics: {},
  access: {},
  links: {},
  searchMetadata: {},
});

describe('journal quality', () => {
  const index = new JournalRankingIndex(parseJournalRankingDataset({
    version: 1,
    source: 'test',
    entries: [{
      title: 'Q1 Journal',
      identifiers: ['1234-5678'],
      metrics: [
        { metricYear: 2023, quartile: 'Q2', sjr: 1.1 },
        { metricYear: 2024, quartile: 'Q1', sjr: 1.2 },
      ],
    }, {
      title: 'Q3 Journal',
      identifiers: ['8765-4321'],
      metrics: [{ metricYear: 2024, quartile: 'Q3', sjr: 0.4 }],
    }],
  }));

  it('normalizes stable identifiers and quartiles', () => {
    expect(normalizeIssn('1234-567X')).toBe('1234567X');
    expect(normalizeIssn('bad')).toBeUndefined();
    expect(normalizeQuartile('Quartile 2')).toBe('Q2');
    expect(normalizeQuartile('Q5')).toBeUndefined();
  });

  it('selects the latest matching SJR metric', () => {
    expect(index.find(work('1234-5678'))).toEqual({
      status: 'ranked',
      quartile: 'Q1',
      sjr: 1.2,
      metricYear: 2024,
    });
  });

  it('attaches matched SJR metadata without restricting unrestricted searches', () => {
    const result = applyJournalQuality([work('1234-5678'), work('1111-1111')], 'any', index);
    expect(result.results).toHaveLength(2);
    expect(result.results[0]?.journalRanking).toEqual({
      status: 'ranked',
      quartile: 'Q1',
      sjr: 1.2,
      metricYear: 2024,
    });
    expect(result.results[1]?.journalRanking).toBeUndefined();
  });

  it('applies quartile and ranked-only modes', () => {
    expect(applyJournalQuality([work('1234-5678'), work('8765-4321')], 'q1', index).results).toHaveLength(1);
    expect(applyJournalQuality([work('1234-5678'), work('8765-4321')], 'q1-q2', index).results).toHaveLength(1);
    expect(applyJournalQuality([work('1234-5678'), work('8765-4321')], 'ranked', index).results).toHaveLength(2);
  });

  it('includes matched and unmatched journals in include-unranked mode', () => {
    const result = applyJournalQuality([work('1234-5678'), work('1111-1111'), work('2222-2222', 'repository')], 'include-unranked', index);
    expect(result.results).toHaveLength(2);
    expect(result.results[1]?.journalRanking).toEqual({ status: 'unranked' });
  });
});
