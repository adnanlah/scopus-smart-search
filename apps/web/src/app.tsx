import { useRef, useState, type FormEvent } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AlertCircle, ArrowRight, Search } from 'lucide-react';
import { ApiError, searchPapers } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { PaperRow } from '@/components/paper-row';
import { PaperRowSkeleton } from '@/components/paper-row-skeleton';

const getErrorMessage = (error: Error) => {
  if (error instanceof ApiError && error.status === 429) return 'A search provider is rate limiting requests. Please wait a moment and try again.';
  if (error instanceof ApiError && error.status >= 500) return 'The search service is temporarily unavailable. Please try again.';
  return error.message;
};

interface SearchDraft {
  query: string;
  rankingPreference: string;
  fromYear: string;
}

interface SubmittedSearch {
  query: string;
  rankingPreference: string;
  fromYear?: number;
}

const createEmptySearchDraft = (): SearchDraft => ({
  query: '',
  rankingPreference: '',
  fromYear: '',
});

const buildYearOptions = (currentYear: number) => [
  { value: '', label: 'Any time' },
  { value: String(currentYear), label: `Since ${currentYear}` },
  { value: String(currentYear - 1), label: `Since ${currentYear - 1}` },
  { value: String(currentYear - 4), label: `Since ${currentYear - 4}` },
];

const formatResultSummary = (returnedResults: number, totalResults: number, ranked: boolean): string => {
  const paperLabel = returnedResults === 1 ? 'paper' : 'papers';
  const matchLabel = totalResults === 1 ? 'match' : 'matches';
  return `${returnedResults.toLocaleString()} ${paperLabel}${ranked ? ' ranked' : ''} · ${totalResults.toLocaleString()} ${matchLabel}`;
};

export const App = () => {
  const yearOptions = buildYearOptions(new Date().getFullYear());
  const [draft, setDraft] = useState<SearchDraft>(createEmptySearchDraft);
  const [submittedSearch, setSubmittedSearch] = useState<SubmittedSearch>();
  const [showValidation, setShowValidation] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const searchQuery = useQuery({
    queryKey: [
      'papers',
      submittedSearch?.query,
      submittedSearch?.rankingPreference,
      submittedSearch?.fromYear,
    ],
    queryFn: ({ signal }) => searchPapers({
      query: submittedSearch!.query,
      rankingPreference: submittedSearch!.rankingPreference,
      fromYear: submittedSearch!.fromYear,
    }, signal),
    enabled: Boolean(submittedSearch),
    retry: 1,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  const isInvalid = draft.query.trim().length === 0;
  const isUpdating = searchQuery.isFetching && !searchQuery.isPending;
  const displayedPapers = searchQuery.data?.papers ?? [];
  const resultSummary = searchQuery.data
    ? formatResultSummary(
      searchQuery.data.returnedResults,
      searchQuery.data.totalResults,
      Boolean(submittedSearch?.rankingPreference),
    )
    : undefined;

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextQuery = draft.query.trim();
    if (!nextQuery) {
      setShowValidation(true);
      searchInputRef.current?.focus();
      return;
    }
    setShowValidation(false);
    setSubmittedSearch({
      query: nextQuery,
      rankingPreference: draft.rankingPreference.trim(),
      fromYear: draft.fromYear ? Number(draft.fromYear) : undefined,
    });
  };

  const resetSearch = () => {
    setDraft(createEmptySearchDraft());
    setSubmittedSearch(undefined);
    setShowValidation(false);
    searchInputRef.current?.focus();
  };

  const statusText = searchQuery.isPending
    ? 'Searching for papers.'
    : searchQuery.isError
      ? `Search failed. ${getErrorMessage(searchQuery.error)}`
      : searchQuery.data?.papers.length === 0
        ? 'Search complete. No papers found.'
        : searchQuery.data
          ? `Search complete. ${displayedPapers.length} papers shown.`
          : '';

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground sm:py-8">
      <div className="relative mx-auto max-w-4xl space-y-8">
        <header className="pb-1">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Literature search</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">Find papers that fit your research.</h1>
        </header>

        <section className="rounded-xl bg-card p-0" aria-labelledby="search-heading">
          <div className="mb-4">
            <h2 id="search-heading" className="text-base font-semibold tracking-tight">Start a search</h2>
            <p className="mt-1 text-sm text-muted-foreground">Enter a topic and optionally describe what matters most.</p>
          </div>
          <form onSubmit={submitSearch} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="paper-query">Research topic</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  ref={searchInputRef}
                  id="paper-query"
                  value={draft.query}
                  onChange={(event) => {
                    setDraft((current) => ({ ...current, query: event.target.value }));
                    if (showValidation && event.target.value.trim()) setShowValidation(false);
                  }}
                  placeholder="e.g. retrieval-augmented generation for scientific discovery"
                  autoComplete="off"
                  autoFocus
                  aria-invalid={showValidation && isInvalid}
                  aria-describedby={showValidation && isInvalid ? 'query-error' : undefined}
                  className="h-11 pl-10 text-sm focus-visible:ring-4 focus-visible:ring-primary/10"
                />
              </div>
              {showValidation && isInvalid && <p id="query-error" className="text-xs font-medium text-destructive">Enter a topic before searching.</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="paper-filter">What should rank higher? <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Textarea
                id="paper-filter"
                value={draft.rankingPreference}
                onChange={(event) => setDraft((current) => ({
                  ...current,
                  rankingPreference: event.target.value,
                }))}
                placeholder="e.g. studies that evaluate retrieval quality using human judgments"
                rows={2}
              />
            </div>

            <div className="flex flex-col gap-4 pt-1 sm:flex-row sm:items-end sm:justify-between">
              <div className="space-y-2 sm:w-48">
                <Label htmlFor="publication-year">Publication date</Label>
                <Select
                  id="publication-year"
                  value={draft.fromYear}
                  onChange={(event) => setDraft((current) => ({
                    ...current,
                    fromYear: event.target.value,
                  }))}
                >
                  {yearOptions.map((option) => (
                    <option key={option.value || 'any'} value={option.value}>{option.label}</option>
                  ))}
                </Select>
              </div>
              <Button type="submit" disabled={searchQuery.isFetching} className="h-10 min-w-28 gap-2">
                {!searchQuery.isFetching && <Search className="h-4 w-4" aria-hidden="true" />}
                {searchQuery.isFetching ? 'Searching…' : 'Search'}
              </Button>
            </div>
          </form>
        </section>

        <div className="sr-only" aria-live="polite">{statusText}</div>

        {submittedSearch && (
          <section aria-labelledby="results-heading" className="mx-auto max-w-4xl space-y-5">
            <div className="flex flex-col gap-3 pb-1 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-primary">Literature results</p>
                <h2 id="results-heading" className="truncate text-xl font-semibold tracking-tight sm:text-2xl">“{submittedSearch.query}”</h2>
              </div>
              <div className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
                {isUpdating && 'Updating…'}
                {!isUpdating && resultSummary}
              </div>
            </div>

            {searchQuery.isPending && <div className="divide-y overflow-hidden rounded-2xl border bg-card"><PaperRowSkeleton /><PaperRowSkeleton /></div>}

            {searchQuery.isError && (
              <Alert className="flex items-start gap-3 border-destructive/20 bg-destructive/5 p-5">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
                <div className="min-w-0 flex-1 space-y-1">
                  <AlertTitle>We couldn’t complete that search.</AlertTitle>
                  <AlertDescription>{getErrorMessage(searchQuery.error)}</AlertDescription>
                  <div className="flex flex-wrap gap-2 pt-2">
                    <Button type="button" size="sm" onClick={() => void searchQuery.refetch()}>Try again</Button>
                    <Button type="button" variant="outline" size="sm" onClick={resetSearch}>Return to search</Button>
                  </div>
                </div>
              </Alert>
            )}

            {searchQuery.isSuccess && !searchQuery.isPlaceholderData && searchQuery.data.papers.length === 0 && (
              <div className="rounded-2xl border border-dashed bg-card px-6 py-12 text-center">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground"><Search className="h-5 w-5" aria-hidden="true" /></span>
                <h3 className="mt-4 font-semibold">No papers found for this search</h3>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">Try broader keywords, remove a phrase, or search for a related concept.</p>
                <Button type="button" variant="outline" size="sm" className="mt-5 gap-2" onClick={resetSearch}>Start a new search <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></Button>
              </div>
            )}

            {searchQuery.isSuccess && searchQuery.data.papers.length > 0 && (
              <div className="divide-y overflow-hidden rounded-2xl border bg-card">
                {displayedPapers.map((paper) => <PaperRow key={paper.id} paper={paper} />)}
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
};
