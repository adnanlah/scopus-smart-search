import { describe, expect, it } from 'vitest';
import type { WorkResult } from '@openalex/shared';
import { buildJevPaperState } from './jev-state.js';

const makeWork = (overrides: Partial<WorkResult> = {}): WorkResult => ({
  rank: 1,
  title: 'Paper',
  authors: [],
  affiliations: [],
  publication: {},
  identifiers: {},
  metrics: {},
  access: {},
  links: {},
  searchMetadata: {},
  ...overrides,
});

describe('buildJevPaperState', () => {
  it('builds the exact allowlisted content payload without citation or raw metadata', () => {
    const work = makeWork({
      rank: 7,
      openAlexId: 'https://openalex.org/W7',
      title: '  Rich   paper  ',
      abstract: 'A content-rich abstract.',
      workType: 'review',
      language: 'en',
      topics: [
        { name: 'Meta-learning', subfield: 'Artificial Intelligence', field: 'Computer Science', domain: 'Physical Sciences' },
        { name: 'Neural Networks' },
        { name: 'Model Evaluation' },
        { name: 'Excluded fourth topic' },
      ],
      keywords: ['Meta-learning', 'Machine learning', 'Few-shot learning', 'Neural networks', 'Benchmark', 'Excluded sixth keyword'],
      indexedIn: ['crossref', 'pubmed'],
      isRetracted: false,
      authors: [
        { id: 'A1', name: 'First Author', position: 'first', corresponding: false, countries: ['US'], affiliations: ['I1'] },
        { id: 'A2', name: 'Corresponding Author', position: 'middle', corresponding: true, countries: ['GB'], affiliations: ['I2'] },
        { id: 'A3', name: 'Unselected Author', position: 'middle', corresponding: false, affiliations: [] },
        { id: 'A4', name: 'Last Author', position: 'last', corresponding: false, affiliations: ['I1'] },
      ],
      affiliations: [
        { id: 'I1', name: 'Research University', country: 'US' },
        { id: 'I2', name: 'AI Institute', country: 'GB' },
      ],
      publication: {
        name: 'Journal of Machine Learning',
        sourceType: 'journal',
        publisher: 'Research Publisher',
        issn: '1234-5678',
        publicationDate: '2025-03-12',
        volume: '9',
        issueIdentifier: '2',
        pageRange: '1-20',
      },
      identifiers: { doi: '10.1234/secret' },
      metrics: { citedByCount: 999 },
      access: { openAccess: true, accessType: 'gold', license: 'cc-by' },
      links: { doi: 'https://doi.org/10.1234/secret' },
      searchMetadata: {
        cited_by_count: 999,
        citation_normalized_percentile: { value: 1 },
        fwci: 42,
        primary_location: { source: { listed_in: ['cwts-core'] } },
      },
    });

    const state = buildJevPaperState(work);

    expect(state).toEqual({
      title: 'Rich paper',
      abstract: 'A content-rich abstract.',
      work_type: 'review',
      language: 'en',
      publication_date: '2025-03-12',
      topics: [
        { name: 'Meta-learning', subfield: 'Artificial Intelligence', field: 'Computer Science', domain: 'Physical Sciences' },
        { name: 'Neural Networks' },
        { name: 'Model Evaluation' },
      ],
      keywords: ['Meta-learning', 'Machine learning', 'Few-shot learning', 'Neural networks', 'Benchmark'],
      authorship: {
        available_author_count: 4,
        sampled_authors: [
          { name: 'First Author', position: 'first', corresponding: false, institutions: ['Research University'], countries: ['US'] },
          { name: 'Corresponding Author', position: 'middle', corresponding: true, institutions: ['AI Institute'], countries: ['GB'] },
          { name: 'Last Author', position: 'last', corresponding: false, institutions: ['Research University'], countries: ['US'] },
        ],
        sampled: true,
      },
      source: {
        name: 'Journal of Machine Learning',
        type: 'journal',
        publisher: 'Research Publisher',
        issn: '1234-5678',
      },
      access: {
        open_access: true,
        status: 'gold',
        license: 'cc-by',
        indexed_in: ['crossref', 'pubmed'],
      },
      is_retracted: false,
    });
    expect(state).not.toHaveProperty('metrics');
    expect(state).not.toHaveProperty('rank');
    expect(state).not.toHaveProperty('identifiers');
    expect(state).not.toHaveProperty('links');
    expect(state).not.toHaveProperty('searchMetadata');
    expect(JSON.stringify(state)).not.toMatch(/cited|citation|fwci|cwts-core|10\.1234\/secret/i);
  });

  it('omits unavailable fields instead of sending empty values', () => {
    const state = buildJevPaperState(makeWork({
      title: 'Minimal paper',
      abstract: undefined,
      publication: {},
    }));

    expect(state).toEqual({ title: 'Minimal paper' });
  });

  it('deduplicates representative authors and caps corresponding authors at six', () => {
    const work = makeWork({
      title: 'Large collaboration',
      authors: [
        { id: 'A0', name: 'First', position: 'first', affiliations: [] },
        ...Array.from({ length: 8 }, (_, index) => ({
          id: index === 1 ? 'A1' : `A${index + 1}`,
          name: index === 1 ? 'Duplicate corresponding' : `Corresponding ${index + 1}`,
          position: 'middle' as const,
          corresponding: true,
          affiliations: [],
        })),
        { id: 'A9', name: 'Last', position: 'last', affiliations: [] },
      ],
    });

    const authorship = buildJevPaperState(work).authorship;

    expect(authorship?.available_author_count).toBe(10);
    expect(authorship?.sampled).toBe(true);
    expect(authorship?.sampled_authors.map((author) => author.name)).toEqual([
      'First',
      'Corresponding 1',
      'Corresponding 3',
      'Corresponding 4',
      'Corresponding 5',
      'Corresponding 6',
      'Last',
    ]);
  });
});
