import { useMemo, useRef, useState, type FormEvent } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AlertCircle, AlertTriangle, ArrowRight, Search, Sparkles } from 'lucide-react';
import { ApiError, searchPapers, type HydrationSummary } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { PaperRow } from '@/components/paper-row';
import { PaperRowSkeleton } from '@/components/paper-row-skeleton';

const resultLimitOptions = [10, 25, 50, 100];

const getErrorMessage = (error: Error) => {
  if (error instanceof ApiError && error.status === 429) return 'Scopus is rate limiting requests. Please wait a moment and try again.';
  if (error instanceof ApiError && error.status >= 500) return 'The search service is temporarily unavailable. Please try again.';
  return error.message;
};
const getHydrationNotice = (hydration: HydrationSummary) => {
  const count = `${hydration.failed} ${hydration.failed === 1 ? 'abstract' : 'abstracts'}`;
  if (hydration.issue?.kind === 'access') {
    return {
      title: 'Abstract access is unavailable.',
      description: `Scopus rejected access to ${count}. Check that your API key and institution entitlement include Abstract Retrieval. The available search results are still shown.`,
    };
  }
  if (hydration.issue?.kind === 'rate-limit') {
    return {
      title: 'Abstract retrieval is temporarily rate limited.',
      description: `Scopus could not load ${count} right now. The available search results are still shown; try again later for abstracts.`,
    };
  }
  return {
    title: 'Some abstracts could not be loaded.',
    description: `${count} could not be retrieved, but the available search results are still shown.`,
  };
};

export const App = () => {
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [limit, setLimit] = useState(10);
  const [submittedLimit, setSubmittedLimit] = useState(10);
  const [showValidation, setShowValidation] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const searchQuery = useQuery({
    queryKey: ['papers', submittedQuery, submittedLimit],
    queryFn: ({ signal }) => searchPapers({ query: submittedQuery, limit: submittedLimit }, signal),
    enabled: submittedQuery.length > 0,
    retry: 1,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  const isInvalid = query.trim().length === 0;
  const isUpdating = searchQuery.isFetching && !searchQuery.isPending;
  const resultSummary = useMemo(() => {
    if (!searchQuery.data) return undefined;
    const paperLabel = searchQuery.data.totalResults === 1 ? 'paper' : 'papers';
    return `${searchQuery.data.totalResults.toLocaleString()} ${paperLabel} · ${searchQuery.data.returnedResults} shown`;
  }, [searchQuery.data]);

  const hydrationNotice = searchQuery.data && !searchQuery.isPlaceholderData && searchQuery.data.hydration.failed > 0 ? getHydrationNotice(searchQuery.data.hydration) : undefined;

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextQuery = query.trim();
    if (!nextQuery) {
      setShowValidation(true);
      searchInputRef.current?.focus();
      return;
    }
    setShowValidation(false);
    setSubmittedQuery(nextQuery);
    setSubmittedLimit(limit);
  };

  const resetSearch = () => {
    setQuery('');
    setSubmittedQuery('');
    setShowValidation(false);
    searchInputRef.current?.focus();
  };

  const statusText = searchQuery.isPending
    ? 'Searching Scopus for papers.'
    : searchQuery.isError
      ? `Search failed. ${getErrorMessage(searchQuery.error)}`
      : searchQuery.data?.papers.length === 0
        ? 'Search complete. No papers found.'
        : searchQuery.data
          ? `Search complete. ${searchQuery.data.returnedResults} papers shown.`
          : '';

  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:py-12">
      <div className="relative mx-auto max-w-5xl space-y-10 sm:space-y-12">
        <header className="mx-auto max-w-3xl space-y-6 text-center">
          <div className="inline-flex items-center gap-3 rounded-full border bg-card px-3 py-2 text-left">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-primary">Scopus Smart Search</span>
              <span className="block text-xs text-muted-foreground">Enriched literature search</span>
            </span>
          </div>
          <div className="space-y-3">
            <h1 className="text-3xl font-semibold tracking-[-0.03em] sm:text-5xl">A clearer way to search the literature.</h1>
            <p className="mx-auto max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">Find relevant Scopus papers, then scan the context that helps you decide what to read next.</p>
          </div>
        </header>

        <section className="mx-auto max-w-4xl rounded-2xl border bg-card p-4 sm:p-6" aria-labelledby="search-heading">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 id="search-heading" className="text-base font-semibold tracking-tight">Start with a research question</h2>
              <p className="mt-1 text-sm text-muted-foreground">Use keywords, phrases, or a complete topic.</p>
            </div>
            <span className="hidden rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground sm:inline-flex">Up to 100 papers</span>
          </div>
          <form onSubmit={submitSearch} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="paper-query">Research topic</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  ref={searchInputRef}
                  id="paper-query"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    if (showValidation && event.target.value.trim()) setShowValidation(false);
                  }}
                  placeholder="e.g. retrieval-augmented generation for scientific discovery"
                  autoComplete="off"
                  autoFocus
                  aria-invalid={showValidation && isInvalid}
                  aria-describedby={showValidation && isInvalid ? 'query-help query-error' : 'query-help'}
                  className="h-12 pl-10 pr-20 text-sm focus-visible:ring-4 focus-visible:ring-primary/10"
                />
                <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border bg-muted px-2 py-1 text-[10px] font-medium text-muted-foreground sm:inline-block">Enter ↵</kbd>
              </div>
              <p id="query-help" className="text-xs text-muted-foreground">Search terms are sent securely through your configured API.</p>
              {showValidation && isInvalid && <p id="query-error" className="text-xs font-medium text-destructive">Enter a topic before searching.</p>}
            </div>
            <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="space-y-1">
                <Label htmlFor="result-limit">Results per search</Label>
                <p className="text-xs text-muted-foreground">Choose how broad your first pass should be.</p>
              </div>
              <div className="flex gap-3">
                <Select id="result-limit" value={limit} onChange={(event) => setLimit(Number(event.target.value))} className="w-28 bg-background" aria-label="Results per search">
                  {resultLimitOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                </Select>
                <Button type="submit" disabled={searchQuery.isFetching} className="h-10 min-w-28 gap-2">
                  {!searchQuery.isFetching && <Search className="h-4 w-4" aria-hidden="true" />}
                  {searchQuery.isFetching ? 'Searching…' : 'Search'}
                </Button>
              </div>
            </div>
          </form>
        </section>

        <div className="sr-only" aria-live="polite">{statusText}</div>

        {submittedQuery && (
          <section aria-labelledby="results-heading" className="mx-auto max-w-4xl space-y-5">
            <div className="flex flex-col gap-3 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-primary">Literature results</p>
                <h2 id="results-heading" className="truncate text-xl font-semibold tracking-tight sm:text-2xl">“{submittedQuery}”</h2>
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

            {hydrationNotice && (
              <Alert className="flex items-start gap-3 border-amber-200 bg-amber-50/70 p-4 text-amber-950">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
                <div className="min-w-0">
                  <AlertTitle>{hydrationNotice.title}</AlertTitle>
                  <AlertDescription className="text-amber-900">{hydrationNotice.description}</AlertDescription>
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
                {searchQuery.data.papers.map((paper) => <PaperRow key={paper.id} paper={paper} />)}
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
};
