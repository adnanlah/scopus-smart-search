import { describe, expect, it, vi } from 'vitest';
import type { WorkResult } from '@openalex/shared';
import { JEV_RANKING_CONCURRENCY, JevSemanticRanker } from './jev.js';

const makeWork = (rank: number, title: string, abstract: string | undefined = `${title} abstract`): WorkResult => ({
  rank,
  title,
  abstract,
  authors: [],
  affiliations: [],
  publication: { name: 'Research Journal', publicationDate: '2024-01-01' },
  identifiers: {},
  metrics: {},
  access: {},
  links: {},
  searchMetadata: {},
});

describe('JevSemanticRanker', () => {
  it('scores candidates independently and retains every work with stable tie ordering', async () => {
    const works = [
      { ...makeWork(1, 'Low match'), abstract: undefined },
      makeWork(2, 'High match'),
      makeWork(3, 'Very low match'),
      makeWork(4, 'High match tie'),
    ];
    const scores: Record<string, number> = {
      'Low match': 0.1,
      'High match': 0.4,
      'Very low match': 0.05,
      'High match tie': 0.4,
    };
    const client = {
      systemOne: vi.fn().mockImplementation(async (request: { state: { paper: { title: string } } }) => ({
        answers: { is_useful_match: { noul: scores[request.state.paper.title] } },
      })),
    };

    const result = await new JevSemanticRanker(client).rank(
      works,
      'machine learning meta-learning',
      'good model',
    );

    expect(client.systemOne).toHaveBeenCalledTimes(4);
    const requests = client.systemOne.mock.calls.map(([request]) => request);
    expect(requests[0]).toMatchObject({
      model: 'jev-latest',
      state: {
        research_topic: 'machine learning meta-learning',
        ranking_preference: 'good model',
        paper: { title: 'Low match' },
      },
    });
    expect(requests[0].questions.is_useful_match.instructions).toContain('not only its title and abstract');
    expect(requests[0].questions.is_useful_match.instructions).toContain('Do not infer quality');
    expect(requests[0].questions.is_useful_match.instructions).toContain('not a mandatory inclusion rule');
    expect(requests.map((request) => request.state.paper.title)).toEqual(works.map((work) => work.title));
    expect(result.map((work) => work.title)).toEqual(['High match', 'High match tie', 'Low match', 'Very low match']);
    expect(result.map((work) => work.semanticScore)).toEqual([0.4, 0.4, 0.1, 0.05]);
  });

  it('limits concurrent Jev requests', async () => {
    let activeRequests = 0;
    let maximumActiveRequests = 0;
    const client = {
      systemOne: vi.fn().mockImplementation(async () => {
        activeRequests += 1;
        maximumActiveRequests = Math.max(maximumActiveRequests, activeRequests);
        await new Promise((resolve) => setTimeout(resolve, 1));
        activeRequests -= 1;
        return { answers: { is_useful_match: { noul: 0.5 } } };
      }),
    };
    const works = Array.from(
      { length: JEV_RANKING_CONCURRENCY + 5 },
      (_, index) => makeWork(index + 1, `Work ${index + 1}`),
    );

    await new JevSemanticRanker(client).rank(works, 'topic', 'preference');

    expect(maximumActiveRequests).toBeGreaterThan(1);
    expect(maximumActiveRequests).toBeLessThanOrEqual(JEV_RANKING_CONCURRENCY);
  });

  it('rejects malformed Jev scores instead of silently changing results', async () => {
    const client = {
      systemOne: vi.fn().mockResolvedValue({ answers: { is_useful_match: { noul: 2 } } }),
    };

    await expect(
      new JevSemanticRanker(client).rank([makeWork(1, 'Invalid')], 'topic', 'preference'),
    ).rejects.toThrow('invalid relevance score');
  });
});
