import { memo, useState } from 'react';
import { ArrowUpRight, Check, Clipboard, ExternalLink, Quote, Sparkles } from 'lucide-react';
import type { Paper } from '@/lib/api';
import { Button } from '@/components/ui/button';

interface PaperRowProps {
  paper: Paper;
  isExpanded?: boolean;
  onToggleExpanded?: () => void;
}

const ABSTRACT_PREVIEW_LENGTH = 280;

const formatBadge = (value: string): string => value
  .replace(/[-_]+/g, ' ')
  .replace(/\b\w/g, (character) => character.toUpperCase());

const formatLicense = (value: string): string => value.toLowerCase().startsWith('cc-')
  ? value.replace(/-/g, ' ').toUpperCase()
  : formatBadge(value);

export const PaperRow = memo(({ paper, isExpanded = false, onToggleExpanded }: PaperRowProps) => {
  const [isCopied, setIsCopied] = useState(false);
  const abstract = paper.abstract ?? '';
  const canExpandAbstract = abstract.length > ABSTRACT_PREVIEW_LENGTH;
  const visibleAbstract = isExpanded || !canExpandAbstract ? abstract : `${abstract.slice(0, ABSTRACT_PREVIEW_LENGTH).trimEnd()}…`;
  const authorSummary = paper.authors.length > 0
    ? `${paper.authors.slice(0, 3).join(', ')}${paper.authors.length > 3 ? ` +${paper.authors.length - 3}` : ''}`
    : undefined;
  const doiUrl = paper.doi ? `https://doi.org/${paper.doi}` : undefined;
  const semanticScoreLabel = typeof paper.semanticScore === 'number' ? `AI match: ${Math.round(paper.semanticScore * 100)}%` : undefined;
  const sourceDetails = [
    paper.venue,
    paper.year,
    paper.volume ? `Vol. ${paper.volume}` : undefined,
    paper.issue ? `Issue ${paper.issue}` : undefined,
    paper.pageRange ? `pp. ${paper.pageRange}` : undefined,
  ].filter((value): value is string => Boolean(value));
  const journalRankingLabel = paper.journalRanking?.status === 'unranked'
    ? 'Unranked'
    : paper.journalRanking?.quartile
      ? [
        paper.journalRanking.quartile,
        paper.journalRanking.sjr === undefined ? undefined : `SJR ${paper.journalRanking.sjr}`,
        paper.journalRanking.metricYear === undefined ? undefined : String(paper.journalRanking.metricYear),
      ].filter((value): value is string => Boolean(value)).join(' · ')
      : undefined;
  const sourceTypeBadge = paper.sourceType
    ? [formatBadge(paper.sourceType), journalRankingLabel].filter((value): value is string => Boolean(value)).join(' · ')
    : journalRankingLabel;
  const sourceBadges = [
    sourceTypeBadge,
    paper.openAccess ? 'Open access' : undefined,
    paper.license ? formatLicense(paper.license) : undefined,
  ].filter((value): value is string => Boolean(value));
  const citationLabel = typeof paper.citedByCount === 'number'
    ? `${paper.citedByCount.toLocaleString()} citations`
    : undefined;

  const copyDoi = async () => {
    if (!paper.doi || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(paper.doi);
      setIsCopied(true);
      window.setTimeout(() => setIsCopied(false), 1800);
    } catch {
      setIsCopied(false);
    }
  };

  return (
    <article className="px-4 py-4 sm:px-5">
      <h3 className="text-base font-semibold leading-snug tracking-[-0.015em] text-foreground sm:text-lg">
        {paper.externalUrl ? (
          <a href={paper.externalUrl} target="_blank" rel="noreferrer" className="inline-flex items-start gap-2 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4">
            <span>{paper.title}</span><ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          </a>
        ) : paper.title}
      </h3>
      {sourceDetails.length > 0 && <p className="mt-1.5 text-xs text-muted-foreground">{sourceDetails.join(' · ')}</p>}
      {(sourceBadges.length > 0 || semanticScoreLabel) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {sourceBadges.map((badge) => <span key={badge} className="rounded border bg-muted/40 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">{badge}</span>)}
          {semanticScoreLabel && (
            <span aria-label={semanticScoreLabel} className="inline-flex items-center gap-1 rounded border border-primary/20 bg-primary/5 px-1.5 py-0.5 text-[11px] font-medium text-primary">
              <Sparkles className="h-3 w-3" aria-hidden="true" />{semanticScoreLabel}
            </span>
          )}
        </div>
      )}

      {paper.abstract && (
        <div className="mt-3 space-y-1.5">
          <p className="text-sm leading-6 text-muted-foreground">{visibleAbstract}</p>
          {canExpandAbstract && <button type="button" className="text-xs font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" onClick={onToggleExpanded} aria-expanded={isExpanded}>{isExpanded ? 'Show less' : 'Read full abstract'}</button>}
        </div>
      )}

      {(authorSummary || citationLabel || paper.doi || paper.externalUrl) && (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          {authorSummary && <p className="min-w-0 max-w-2xl text-xs leading-5 text-muted-foreground">{authorSummary}</p>}
          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:ml-auto">
            {citationLabel && (
              <span aria-label={citationLabel} className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground" title={citationLabel}>
                <Quote className="h-3.5 w-3.5" aria-hidden="true" />{citationLabel}
              </span>
            )}
            {doiUrl && (
              <div className="flex max-w-full items-center gap-1.5">
                <a href={doiUrl} target="_blank" rel="noreferrer" title={`Open DOI ${paper.doi}`} className="inline-flex h-7 max-w-[19rem] items-center gap-1.5 rounded-md border bg-background px-2 text-[11px] font-medium text-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                  <span className="truncate">doi: {paper.doi}</span><ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                </a>
                <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => void copyDoi()} aria-label={isCopied ? 'DOI copied' : 'Copy DOI'} title={isCopied ? 'DOI copied' : 'Copy DOI'}>{isCopied ? <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" /> : <Clipboard className="h-3.5 w-3.5" aria-hidden="true" />}</Button>
              </div>
            )}
            {paper.externalUrl && <a href={paper.externalUrl} target="_blank" rel="noreferrer" className="inline-flex h-7 items-center gap-1.5 rounded-md bg-primary px-2.5 text-[11px] font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">Open paper <ExternalLink className="h-3 w-3" aria-hidden="true" /></a>}
          </div>
        </div>
      )}
      <span className="sr-only" aria-live="polite">{isCopied ? 'DOI copied to clipboard.' : ''}</span>
    </article>
  );
});

PaperRow.displayName = 'PaperRow';
