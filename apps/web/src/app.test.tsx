import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/app';

const paper = {
  rank: 1,
  openAlexId: 'https://openalex.org/W1',
  title: 'Climate adaptation strategies',
  abstract: 'A'.repeat(500),
  authors: [{ name: 'A Researcher', affiliations: [] }],
  affiliations: [],
  publication: { name: 'Research Journal', coverDate: '2023-01-01' },
  identifiers: { doi: '10.1000/example' },
  metrics: { citedByCount: 12 },
  access: { openAccess: true },
  links: { openalex: 'https://openalex.org/W1', doi: 'https://doi.org/10.1000/example' },
  searchMetadata: {},
};

const makeResponse = (overrides: Record<string, unknown> = {}) => ({
  query: 'climate adaptation',
  requestedLimit: 10,
  totalResults: 1,
  returnedResults: 1,
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

  it('renders OpenAlex metadata and safe DOI/OpenAlex links', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(makeResponse()), { status: 200 })));
    const user = userEvent.setup();
    renderApp();

    await user.type(screen.getByLabelText('Research topic'), 'climate adaptation');
    await user.keyboard('{Enter}');

    expect(await screen.findByRole('heading', { name: 'Climate adaptation strategies' })).toBeInTheDocument();
    expect(screen.getByText('A Researcher')).toBeInTheDocument();
    expect(screen.getByText('Read full abstract')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /doi: 10.1000\/example/i })).toHaveAttribute('href', 'https://doi.org/10.1000/example');
    expect(screen.getByRole('link', { name: /Open paper/i })).toHaveAttribute('href', 'https://openalex.org/W1');
  });

  it('keeps works without abstracts visible without an abstract warning', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(makeResponse({
      totalResults: 1,
      results: [{ ...paper, abstract: undefined }],
    })), { status: 200 })));
    const user = userEvent.setup();
    renderApp();

    await user.type(screen.getByLabelText('Research topic'), 'climate adaptation');
    await user.keyboard('{Enter}');

    expect(await screen.findByRole('heading', { name: 'Climate adaptation strategies' })).toBeInTheDocument();
    expect(screen.queryByText(/abstract access/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/abstract access/i)).not.toBeInTheDocument();
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
