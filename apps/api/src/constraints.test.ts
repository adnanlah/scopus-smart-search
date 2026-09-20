import { describe, expect, it, vi } from 'vitest';
import type { SearchConstraint, SearchInterpretation } from '@openalex/shared';
import type { JevClient } from './jev.js';
import {
  composeOpenAlexFilters,
  JEV_CONSTRAINT_THRESHOLD,
  JevConstraintInferer,
} from './constraints.js';

const inferred = (overrides: Partial<SearchConstraint>): SearchConstraint => ({
  type: 'field',
  value: '17',
  label: 'Computer science',
  confidence: 0.95,
  applied: true,
  source: 'inferred',
  openAlexFilter: 'topics.field.id:17',
  status: 'applied',
  evidence: 'Matched “computer science” in the query.',
  ...overrides,
});

describe('composeOpenAlexFilters', () => {
  it('ORs values within a category and ANDs different categories', () => {
    const result = composeOpenAlexFilters({
      baseFilters: ['primary_location.source.is_core:true'],
      inferred: [
        inferred({ value: '17', openAlexFilter: 'topics.field.id:17' }),
        inferred({ value: '28', label: 'Medicine', openAlexFilter: 'topics.field.id:28' }),
        inferred({ type: 'domain', value: '4', label: 'Health sciences', openAlexFilter: 'topics.domain.id:4' }),
      ],
    });

    expect(result.filter).toBe(
      'primary_location.source.is_core:true,topics.field.id:17|28,topics.domain.id:4',
    );
  });

  it('does not apply inferred values shadowed by explicit constraints', () => {
    const result = composeOpenAlexFilters({
      inferred: [inferred({ type: 'work_type', value: 'review', label: 'Review', openAlexFilter: 'type:review' })],
      explicit: [{
        type: 'work_type',
        value: 'article',
        label: 'Article',
        applied: true,
        source: 'explicit',
        openAlexFilter: 'type:article',
        status: 'applied',
      }],
    });

    expect(result.filter).toBe('type:article');
    expect(result.constraints).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: 'article', source: 'explicit', applied: true }),
      expect.objectContaining({ value: 'review', status: 'shadowed_by_explicit', applied: false }),
    ]));
  });

  it('never serializes a subfield constraint', () => {
    const result = composeOpenAlexFilters({
      inferred: [inferred({
        type: 'field',
        value: 'subfield-1',
        label: 'Should not apply',
        openAlexFilter: 'topics.subfield.id:1',
        status: 'unsupported',
        applied: false,
      })],
    });

    expect(result.filter).toBeUndefined();
  });
});

describe('JevConstraintInferer', () => {
  it('applies confident choices and keeps uncertain choices visible', async () => {
    const client: JevClient = {
      systemOne: vi.fn().mockImplementation(async (request) => {
        const answers: Record<string, { noul: number }> = {};
        for (const key of Object.keys(request.questions)) {
          answers[key] = { noul: key === 'field__17' ? 0.93 : key === 'work_type__review' ? 0.61 : 0.01 };
        }
        return { answers };
      }),
    };

    const result: SearchInterpretation = await new JevConstraintInferer(client).infer(
      'a computer science review of machine learning methods',
    );

    expect(result.threshold).toBe(JEV_CONSTRAINT_THRESHOLD);
    expect(result.available).toBe(true);
    expect(result.constraints).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'field',
        value: '17',
        confidence: 0.93,
        applied: true,
        status: 'applied',
      }),
      expect.objectContaining({
        type: 'work_type',
        value: 'review',
        confidence: 0.61,
        applied: false,
        status: 'ambiguous',
      }),
    ]));
    expect(result.constraints).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ status: 'applied', type: 'domain' }),
    ]));
  });
});
