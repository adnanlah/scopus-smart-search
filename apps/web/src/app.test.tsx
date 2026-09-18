import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/app';

const paper = {
  rank: 1,
  eid: 'paper-1',
  title: 'Climate adaptation strategies',
  abstract: 'A'.repeat(500),
  authors: [],
  affiliations: [],
  publication: { name: 'Research Journal', coverDate: '2023-01-01' },
  identifiers: { doi: '10.1000/example' },
  metrics: { citedByCount: 12 },
  access: { openAccess: true },
  links: { scopus: 'https://www.scopus.com/record/display.uri?eid=paper-1' },
  hydration: { status: 'complete' },
  searchMetadata: { 'dc:creator': 'A Researcher' },
};

const failedPaper = { ...paper, abstract: undefined, hydration: { status: 'failed' } };

const makeResponse = (overrides: Record<string, unknown> = {}) => ({
  query: 'climate adaptation',
  requestedLimit: 10,
  totalResults: 1,
  returnedResults: 1,
  hydratedResults: 1,
  failedResults: 0,
  results: [paper],
  errors: [],
  ...overrides,
});

const renderApp = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><App /></QueryClientProvider>);
};

describe('App', () => {
  afterEach(() => vi.restoreAllMocks());

  it('renders creator fallback metadata and safe DOI/paper links', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(makeResponse()), { status: 200 })));
    const user = userEvent.setup();
    renderApp();

    await user.type(screen.getByLabelText('Research topic'), 'climate adaptation');
    await user.keyboard('{Enter}');

    expect(await screen.findByRole('heading', { name: 'Climate adaptation strategies' })).toBeInTheDocument();
    expect(screen.getByRole('article').parentElement).toHaveClass('divide-y');
    expect(screen.getByRole('article')).not.toHaveClass('shadow-sm');
    expect(screen.getByText('A Researcher')).toBeInTheDocument();
    expect(screen.getByText('Read full abstract')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /doi: 10.1000\/example/i })).toHaveAttribute('href', 'https://doi.org/10.1000/example');
    expect(screen.getByRole('link', { name: /Open paper/i })).toHaveAttribute('href', 'https://www.scopus.com/record/display.uri?eid=paper-1');
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/search?q=climate+adaptation&limit=10', expect.anything()));
  });

  it('keeps failed-hydration cards visible with one access warning', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(makeResponse({ failedResults: 1, hydratedResults: 0, results: [failedPaper], errors: [{ code: 'UPSTREAM_REJECTED', message: 'Scopus rejected the credentials or entitlement for this request.' }] })), { status: 200 })));
    const user = userEvent.setup();
    renderApp();

    await user.type(screen.getByLabelText('Research topic'), 'climate adaptation');
    await user.keyboard('{Enter}');

    expect(await screen.findByRole('heading', { name: 'Climate adaptation strategies' })).toBeInTheDocument();
    expect(screen.getByRole('article').parentElement).toHaveClass('divide-y');
    expect(screen.getByRole('article')).not.toHaveClass('shadow-sm');
    expect(screen.getByText('Abstract access is unavailable.')).toBeInTheDocument();
    expect(screen.getByText(/Check that your API key and institution entitlement include Abstract Retrieval/)).toBeInTheDocument();
    expect(screen.queryByText('Abstract details could not be retrieved for this paper.')).not.toBeInTheDocument();
    expect(screen.queryAllByText('Abstract access is unavailable.')).toHaveLength(1);
  });

  it('uses rate-limit and generic hydration messages', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(makeResponse({ failedResults: 1, hydratedResults: 0, results: [failedPaper], errors: [{ code: 'RATE_LIMITED', message: 'Scopus rate limit or quota was exceeded.' }] })), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(makeResponse({ failedResults: 1, hydratedResults: 0, results: [failedPaper], errors: [{ code: 'ABSTRACT_FAILED', message: 'Abstract unavailable.' }] })), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderApp();

    await user.type(screen.getByLabelText('Research topic'), 'climate adaptation');
    await user.keyboard('{Enter}');
    expect(await screen.findByText('Abstract retrieval is temporarily rate limited.')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Research topic'));
    await user.type(screen.getByLabelText('Research topic'), 'climate adaptation follow-up');
    await user.keyboard('{Enter}');
    expect(await screen.findByText('Some abstracts could not be loaded.')).toBeInTheDocument();
  });

  it('shows an empty state and returns focus to a new search', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(makeResponse({ totalResults: 0, returnedResults: 0, results: [] })), { status: 200 })));
    const user = userEvent.setup();
    renderApp();

    await user.type(screen.getByLabelText('Research topic'), 'unknown topic');
    await user.keyboard('{Enter}');
    expect(await screen.findByText('No papers found for this search')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start a new search' }));
    expect(screen.getByLabelText('Research topic')).toHaveFocus();
  });
});