import { describe, expect, it } from 'vitest';
import { buildKeywordQuery } from './server.js';

describe('buildKeywordQuery', () => {
  it('deduplicates normalized keywords while preserving first occurrence order', () => {
    expect(buildKeywordQuery([
      { phrase: 'Review', score: 0.9 },
      { phrase: 'review', score: 0.8 },
      { phrase: '  Medical  ', score: 0.7 },
      { phrase: 'medical', score: 0.6 },
      { phrase: '', score: 0.5 },
    ])).toBe('review medical');
  });
});
