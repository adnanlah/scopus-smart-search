import { describe, expect, it, vi } from 'vitest';
import type { WorkResult } from '@openalex/shared';
import { JevSemanticFilter } from './jev.js';

const makeWork = (rank: number, title: string): WorkResult => ({
  rank,
  title,
  abstract: `${title} abstract`,
  authors: [],
  affiliations: [],
  publication: { name: 'Research Journal', publicationDate: '2024-01-01' },
  identifiers: {},
  metrics: {},
  access: {},
  links: {},
  searchMetadata: {},
});

describe('JevSemanticFilter', () => {
  it('evaluates every work in one request and filters and ranks by noul probability', async () => {
    const works = [
      makeWork(1, 'High relevance'),
      makeWork(2, 'Borderline relevance'),
      makeWork(3, 'Low relevance'),
      makeWork(4, 'High relevance tie'),
    ];
    works[0] = { ...works[0]!, abstract: 'A'.repeat(5_000) };
    const client = {
      systemOne: vi.fn().mockResolvedValue({
        answers: {
          work_0: { noul: 0.9 },
          work_1: { noul: 0.5 },
          work_2: { noul: 0.49 },
          work_3: { noul: 0.9 },
        },
      }),
    };
    const filter = new JevSemanticFilter(client);

    const result = await filter.filter(works, 'papers evaluating human judgments');

    expect(client.systemOne).toHaveBeenCalledTimes(1);
    const request = client.systemOne.mock.calls[0]![0];
    expect(request.model).toBe('jev-latest');
    expect(request.state.filter_instruction).toBe('papers evaluating human judgments');
    expect(request.state.works).toHaveLength(4);
    expect(request.state.works[0]!.abstract).toBe(works[0]!.abstract);
    expect(request.questions.work_0).toMatchObject({
      instructions: expect.stringContaining('strict inclusion rule'),
      criteria: {
        true: ['The title or abstract provides sufficient explicit evidence that the', 'work satisfies the user’s filter instruction and all important conditions.'],
        false: ['The work is only topically related, satisfies only part of the instruction,', 'or would require inferring an unstated property from indirect clues.'],
      },
    });
    expect(request.questions.work_0.instructions).toContain('works[0]');
    expect(request.questions.work_0.instructions).toContain('works[0].title');
    expect(request.questions.work_0.instructions).toContain('works[0].abstract');
    expect(request.questions.work_3.instructions).toContain('works[3]');
    expect(request.questions.work_3.instructions).toContain('works[3].title');
    expect(request.questions.work_3.instructions).toContain('works[3].abstract');
    expect(request.questions.work_0.instructions).not.toBe(request.questions.work_3.instructions);
    expect(Object.keys(request.questions)).toEqual(['work_0', 'work_1', 'work_2', 'work_3']);
    expect(result.map((work) => work.title)).toEqual(['High relevance', 'High relevance tie', 'Borderline relevance']);
    expect(result.map((work) => work.semanticScore)).toEqual([0.9, 0.9, 0.5]);
  });

  it('rejects malformed Jev scores instead of silently changing results', async () => {
    const client = { systemOne: vi.fn().mockResolvedValue({ answers: { work_0: { noul: 2 } } }) };
    const filter = new JevSemanticFilter(client);

    await expect(filter.filter([makeWork(1, 'Invalid')], 'test')).rejects.toThrow('invalid relevance score');
  });
});
