import { describe, expect, it } from 'vitest';
import { parseAbstractPayload, parseSearchPayload } from './parser.js';

describe('Scopus parsers', () => {
  it('normalizes a search response while retaining the original entry', () => {
    const result = parseSearchPayload({
      'search-results': {
        'opensearch:totalResults': '4',
        entry: [{
          'dc:identifier': 'SCOPUS_ID:123456789',
          eid: '2-s2.0-123456789',
          'dc:title': '  A useful paper  ',
          'dc:creator': 'Doe, Jane',
          'prism:publicationName': 'Journal of Tests',
          'prism:coverDate': '2025-01-01',
          'prism:doi': '10.1234/example',
          'citedby-count': '8',
          author: { authname: 'Doe, Jane', authid: '999' },
          link: [{ '@_ref': 'scopus', '@_href': 'https://www.scopus.com/record/display.uri?eid=123' }],
        }],
      },
    });

    expect(result.totalResults).toBe(4);
    expect(result.entries[0]).toMatchObject({
      scopusId: '123456789',
      eid: '2-s2.0-123456789',
      title: 'A useful paper',
      metrics: { citedByCount: 8 },
      hydration: { status: 'unavailable' },
    });
    expect(result.entries[0]?.links.scopus).toContain('scopus.com');
    expect(result.entries[0]?.searchMetadata['dc:title']).toBe('  A useful paper  ');
  });

  it('extracts full abstract metadata from parsed XML', () => {
    const base = parseSearchPayload({ 'search-results': { entry: [{ 'dc:identifier': 'SCOPUS_ID:123', 'dc:title': 'Search title' }] } }).entries[0];
    if (!base) throw new Error('Expected fixture result.');
    const result = parseAbstractPayload({
      'abstracts-retrieval-response': {
        coredata: {
          'dc:title': 'Full title',
          'dc:description': { 'ce:para': 'This is the abstract text.' },
          'prism:doi': '10.1234/full',
          'prism:publicationName': 'A Journal',
          'citedby-count': '12',
        },
        authors: { author: [{ 'preferred-name': { 'given-name': 'Jane', surname: 'Doe' }, auid: '999' }] },
        affiliation: [{ afid: '1', affilname: 'Test University', city: 'Test City', country: 'Testland' }],
      },
    }, base);

    expect(result.title).toBe('Full title');
    expect(result.abstract).toContain('This is the abstract text.');
    expect(result.identifiers.doi).toBe('10.1234/full');
    expect(result.authors[0]).toMatchObject({ name: 'Jane Doe', authorId: '999' });
    expect(result.affiliations[0]).toMatchObject({ id: '1', name: 'Test University' });
    expect(result.abstractMetadata).toBeDefined();
  });
});
