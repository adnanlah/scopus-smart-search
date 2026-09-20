import { ChevronDown, Filter, Info, Sparkles } from 'lucide-react';
import type { SearchConstraint, SearchInterpretation } from '@openalex/shared';

const statusLabel: Record<SearchConstraint['status'], string> = {
  applied: 'Applied',
  below_threshold: 'Not applied',
  ambiguous: 'Uncertain',
  shadowed_by_explicit: 'Overridden',
  unsupported: 'Not supported',
  unknown: 'Unknown',
};

const typeLabel: Record<SearchConstraint['type'], string> = {
  work_type: 'Paper type',
  domain: 'Domain',
  field: 'Field',
  language: 'Language',
  open_access: 'Access',
  publication_year: 'Publication date',
};

const ConstraintRow = ({ constraint }: { constraint: SearchConstraint }) => (
  <li className="flex items-start justify-between gap-3 rounded-lg border bg-background/60 px-3 py-2 text-sm">
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{constraint.label}</span>
        <span className="text-xs text-muted-foreground">{typeLabel[constraint.type]}</span>
      </div>
      {constraint.evidence && <p className="mt-1 text-xs text-muted-foreground">{constraint.evidence}</p>}
    </div>
    <div className="flex shrink-0 flex-col items-end gap-1">
      {constraint.confidence !== undefined && (
        <span className="text-xs tabular-nums text-muted-foreground">{Math.round(constraint.confidence * 100)}%</span>
      )}
      <span className={constraint.applied
        ? 'rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary'
        : 'rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground'}
      >
        {statusLabel[constraint.status]}
      </span>
    </div>
  </li>
);

const ConstraintGroup = ({
  title,
  constraints,
}: {
  title: string;
  constraints: SearchConstraint[];
}) => constraints.length === 0 ? null : (
  <div className="space-y-2">
    <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{title}</h4>
    <ul className="space-y-2">{constraints.map((constraint) => (
      <ConstraintRow key={`${constraint.source}-${constraint.type}-${constraint.value}`} constraint={constraint} />
    ))}</ul>
  </div>
);

export const ConstraintInspector = ({ interpretation }: { interpretation?: SearchInterpretation }) => {
  if (!interpretation) return null;

  const applied = interpretation.constraints.filter((constraint) => constraint.applied);
  const detected = interpretation.constraints.filter((constraint) => !constraint.applied);

  return (
    <section className="rounded-2xl border bg-card p-4 shadow-sm" aria-labelledby="query-interpretation-heading">
      <details open>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
          <span className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            </span>
            <span id="query-interpretation-heading" className="block text-sm font-semibold">Query interpretation</span>
          </span>
          <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </summary>

        <div className="mt-4 space-y-4">
          {!interpretation.available && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden="true" />
              <span>{interpretation.error ?? 'Jev could not interpret this query.'}</span>
            </div>
          )}

          <ConstraintGroup title="Applied constraints" constraints={applied} />
          <ConstraintGroup title="Detected but not applied" constraints={detected} />

          {interpretation.effectiveFilter && (
            <div className="space-y-2">
              <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                <Filter className="h-3.5 w-3.5" aria-hidden="true" />
                Effective filter
              </h4>
              <div className="flex flex-wrap gap-2" aria-label="Effective filters">
                {interpretation.effectiveFilter.split(',').map((filter) => (
                  <span key={filter} className="rounded-full border bg-muted px-2.5 py-1 font-mono text-xs text-muted-foreground">
                    {filter}
                  </span>
                ))}
              </div>
            </div>
          )}

          {interpretation.available && interpretation.constraints.length === 0 && (
            <p className="text-sm text-muted-foreground">No supported constraints were confidently inferred.</p>
          )}
        </div>
      </details>
    </section>
  );
};

