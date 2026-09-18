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
      publication_date: '2025-01-02',
      abstract_inverted_index: { Useful: [0], abstract: [1] },
      authorships: [{
        author: { id: 'https://openalex.org/A1', display_name: 'Ada Lovelace', orcid: 'https://orcid.org/0000-0001' },
        institutions: [{ id: 'https://openalex.org/I1', display_name: 'Test University', geo: { city: 'Test City', country_code: 'US' } }],
      }],
      primary_location: { source: { display_name: 'Research Journal', issn_l: '1234-5678' }, landing_page_url: 'https://journal.test/work' },
      open_access: { is_oa: true, oa_status: 'gold', oa_url: 'https://repository.test/work' },
      cited_by_count: 12,
      ids: { pmid: 'https://pubmed.ncbi.nlm.nih.gov/42', pmcid: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC42' },
    }, 1);
    expect(result).toMatchObject({
      rank: 1,
      openAlexId: 'https://openalex.org/W123',
      title: 'A useful work',
      abstract: 'Useful abstract',
      authors: [{ id: 'https://openalex.org/A1', name: 'Ada Lovelace', orcid: '0000-0001', affiliations: ['https://openalex.org/I1'] }],
      affiliations: [{ id: 'https://openalex.org/I1', name: 'Test University', city: 'Test City', country: 'US' }],
      identifiers: { doi: '10.1234/example', pubmedId: '42', pmcid: 'PMC42' },
      metrics: { citedByCount: 12 },
      access: { openAccess: true, accessType: 'gold' },
    });
    expect(result.links).toMatchObject({ openalex: 'https://openalex.org/W123', doi: 'https://doi.org/10.1234/example', oa: 'https://repository.test/work' });
  });
});
