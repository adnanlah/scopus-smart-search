import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ConstraintInspector } from './constraint-inspector';

describe('ConstraintInspector', () => {
  it('shows applied and not-applied interpretations with the effective filter', () => {
    render(
      <ConstraintInspector interpretation={{
        threshold: 0.8,
        available: true,
        effectiveFilter: 'topics.field.id:17,type:review',
        constraints: [
          {
            type: 'field',
            value: '17',
            label: 'Computer science',
            confidence: 0.94,
            applied: true,
            source: 'inferred',
            openAlexFilter: 'topics.field.id:17',
            status: 'applied',
            evidence: 'Matched “computer science”.',
          },
          {
            type: 'work_type',
            value: 'review',
            label: 'Review',
            confidence: 0.61,
            applied: false,
            source: 'inferred',
            openAlexFilter: 'type:review',
            status: 'ambiguous',
            evidence: 'Inferred from query semantics.',
          },
        ],
      }} />,
    );

    expect(screen.getByText('Computer science')).toBeInTheDocument();
    expect(screen.getByText('Review')).toBeInTheDocument();
    expect(screen.getByText('Effective OpenAlex filter')).toBeInTheDocument();
    expect(screen.getByText('topics.field.id:17,type:review')).toBeInTheDocument();
    expect(screen.getByText('Applied')).toBeInTheDocument();
    expect(screen.getByText('Uncertain')).toBeInTheDocument();
  });
});
