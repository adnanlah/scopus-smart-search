import { describe, expect, it } from 'vitest';
import { parseWork, reconstructAbstract } from './parser.js';

describe('OpenAlex parser', () => {
  it('reconstructs an inverted abstract index in position order', () => {
    expect(reconstructAbstract({ second: [1], first: [0], repeated: [2, 4], word: [3] })).toBe('first second repeated word repeated');
  });

  it('maps work metadata, authors, access, identifiers, and links', () => {
    const result = parseWork({
      id: 'https://openalex.org/W123',
      display_name: 'A useful work',
      doi: 'https://doi.org/10.1234/example',
      type: 'review',
      language: 'en',
      publication_date: '2025-01-02',
      biblio: { volume: '12', issue: '3', first_page: '45', last_page: '61' },
      abstract_inverted_index: { Useful: [0], abstract: [1] },
      authorships: [{
        author_position: 'first',
        is_corresponding: true,
        author: { id: 'https://openalex.org/A1', display_name: 'Ada Lovelace', orcid: 'https://orcid.org/0000-0001' },
        countries: ['US'],
        institutions: [{ id: 'https://openalex.org/I1', display_name: 'Test University', country_code: 'US', geo: { city: 'Test City' } }],
      }],
      primary_location: { source: { display_name: 'Research Journal', type: 'journal', issn_l: '1234-5678', host_organization_name: 'Research Publisher' }, landing_page_url: 'https://journal.test/work', license: 'cc-by' },
      open_access: { is_oa: true, oa_status: 'gold', oa_url: 'https://repository.test/work' },
      cited_by_count: 12,
      topics: [{
        display_name: 'Useful Research',
        subfield: { display_name: 'Artificial Intelligence' },
        field: { display_name: 'Computer Science' },
        domain: { display_name: 'Physical Sciences' },
      }],
      keywords: [{ display_name: 'Machine learning', score: 0.9 }],
      indexed_in: ['crossref', 'pubmed'],
      is_retracted: false,
      ids: { pmid: 'https://pubmed.ncbi.nlm.nih.gov/42', pmcid: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC42' },
    }, 1);
    expect(result).toMatchObject({
      rank: 1,
      openAlexId: 'https://openalex.org/W123',
      title: 'A useful work',
      abstract: 'Useful abstract',
      workType: 'review',
      language: 'en',
      topics: [{ name: 'Useful Research', subfield: 'Artificial Intelligence', field: 'Computer Science', domain: 'Physical Sciences' }],
      keywords: ['Machine learning'],
      indexedIn: ['crossref', 'pubmed'],
      isRetracted: false,
      authors: [{
        id: 'https://openalex.org/A1',
        name: 'Ada Lovelace',
        orcid: '0000-0001',
        position: 'first',
        corresponding: true,
        countries: ['US'],
        affiliations: ['https://openalex.org/I1'],
      }],
      affiliations: [{ id: 'https://openalex.org/I1', name: 'Test University', city: 'Test City', country: 'US' }],
      publication: { name: 'Research Journal', sourceType: 'journal', publisher: 'Research Publisher', volume: '12', issueIdentifier: '3', pageRange: '45-61' },
      identifiers: { doi: '10.1234/example', pubmedId: '42', pmcid: 'PMC42' },
      metrics: { citedByCount: 12 },
      access: { openAccess: true, accessType: 'gold', license: 'cc-by' },
    });
    expect(result.links).toMatchObject({ openalex: 'https://openalex.org/W123', doi: 'https://doi.org/10.1234/example', oa: 'https://repository.test/work' });
  });
});
