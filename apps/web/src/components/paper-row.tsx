import { useState } from 'react';
import { ArrowUpRight, Check, Clipboard, ExternalLink } from 'lucide-react';
import type { Paper } from '@/lib/api';
import { Button } from '@/components/ui/button';

interface PaperRowProps {
  paper: Paper;
}

const ABSTRACT_PREVIEW_LENGTH = 420;

export const PaperRow = ({ paper }: PaperRowProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const abstract = paper.abstract ?? '';
  const canExpandAbstract = abstract.length > ABSTRACT_PREVIEW_LENGTH;
  const visibleAbstract = isExpanded || !canExpandAbstract ? abstract : `${abstract.slice(0, ABSTRACT_PREVIEW_LENGTH).trimEnd()}…`;
  const authorSummary = paper.authors.length > 0
    ? `${paper.authors.slice(0, 3).join(', ')}${paper.authors.length > 3 ? ` +${paper.authors.length - 3}` : ''}`
    : undefined;
  const doiUrl = paper.doi ? `https://doi.org/${paper.doi}` : undefined;

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
    <article className="px-4 py-6 sm:px-7">
      <h3 className="text-xl font-semibold leading-snug tracking-[-0.02em] text-foreground sm:text-[1.35rem]">
        {paper.externalUrl ? (
          <a href={paper.externalUrl} target="_blank" rel="noreferrer" className="inline-flex items-start gap-2 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4">
            <span>{paper.title}</span><ArrowUpRight className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
          </a>
        ) : paper.title}
      </h3>
      {(paper.venue || paper.year) && (
        <p className="mt-2 text-sm text-muted-foreground">
          {paper.venue}{paper.venue && paper.year ? ' · ' : ''}{paper.year}
        </p>
      )}

      {paper.abstract && (
        <div className="mt-5 space-y-2">
          <p className="text-sm leading-7 text-muted-foreground">{visibleAbstract}</p>
          {canExpandAbstract && <button type="button" className="text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" onClick={() => setIsExpanded((expanded) => !expanded)} aria-expanded={isExpanded}>{isExpanded ? 'Show less' : 'Read full abstract'}</button>}
        </div>
      )}

      {(authorSummary || paper.doi || paper.externalUrl) && (
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {authorSummary && <p className="min-w-0 max-w-2xl text-xs leading-5 text-muted-foreground">{authorSummary}</p>}
          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:ml-auto">
            {doiUrl && (
              <div className="flex max-w-full items-center gap-1.5">
                <a href={doiUrl} target="_blank" rel="noreferrer" title={`Open DOI ${paper.doi}`} className="inline-flex h-8 max-w-[19rem] items-center gap-1.5 rounded-md border bg-background px-2.5 text-xs font-medium text-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                  <span className="truncate">doi: {paper.doi}</span><ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                </a>
                <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => void copyDoi()} aria-label={isCopied ? 'DOI copied' : 'Copy DOI'} title={isCopied ? 'DOI copied' : 'Copy DOI'}>{isCopied ? <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" /> : <Clipboard className="h-3.5 w-3.5" aria-hidden="true" />}</Button>
              </div>
            )}
            {paper.externalUrl && <a href={paper.externalUrl} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">Open paper <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /></a>}
          </div>
        </div>
      )}
      <span className="sr-only" aria-live="polite">{isCopied ? 'DOI copied to clipboard.' : ''}</span>
    </article>
  );
};