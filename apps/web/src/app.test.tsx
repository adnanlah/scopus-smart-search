import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
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
  publication: { name: 'Research Journal', sourceType: 'journal', volume: '12', issueIdentifier: '3', pageRange: '45-61', coverDate: '2023-01-01' },
  identifiers: { doi: '10.1000/example' },
  metrics: { citedByCount: 12 },
  access: { openAccess: true, license: 'cc-by' },
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

const validResearchDescription = 'climate adaptation strategies for resilient cities under increasingly severe weather events';
const validEvaluationDescription = 'human evaluation of retrieval quality for medical research systems and clinical practice';
const encodeQueryValue = (value: string) => value.replace(/ /gu, '+');

const renderApp = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><App /></QueryClientProvider>);
};

describe('App', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders OpenAlex metadata and safe DOI/OpenAlex links', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(makeResponse()), { status: 200 })));
    const user = userEvent.setup();
    renderApp();

    const researchDescription = screen.getByLabelText('Describe your research topic');
    expect(researchDescription).toBeRequired();
    expect(researchDescription.tagName).toBe('TEXTAREA');
    expect(screen.queryByLabelText('Research topic')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/What should rank higher/)).not.toBeInTheDocument();
    await user.type(researchDescription, validResearchDescription);
    await user.click(screen.getByRole('button', { name: 'Search' }));

    expect(await screen.findByRole('heading', { name: 'Climate adaptation strategies' })).toBeInTheDocument();
    expect(screen.getByText('Research Journal · 2023 · Vol. 12 · Issue 3 · pp. 45-61')).toBeInTheDocument();
    expect(screen.getByText('Journal')).toBeInTheDocument();
    expect(screen.getByText('Open access')).toBeInTheDocument();
    expect(screen.getByText('CC BY')).toBeInTheDocument();
    expect(screen.getByText('12 citations')).toBeInTheDocument();
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

    await user.type(screen.getByLabelText('Describe your research topic'), validResearchDescription);
    await user.click(screen.getByRole('button', { name: 'Search' }));

    expect(await screen.findByRole('heading', { name: 'Climate adaptation strategies' })).toBeInTheDocument();
    expect(screen.queryByText(/abstract access/i)).not.toBeInTheDocument();
  });

  it('shows the complete returned batch without frontend pagination', async () => {
    const papers = Array.from({ length: 100 }, (_, index) => ({
      ...paper,
      rank: index + 1,
      openAlexId: `https://openalex.org/W${index + 1}`,
      title: `Climate paper ${index + 1}`,
    }));
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(makeResponse({
      totalResults: 250,
      returnedResults: 100,
      results: papers,
    })), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderApp();

    await user.type(screen.getByLabelText('Describe your research topic'), validResearchDescription);
    await user.click(screen.getByRole('button', { name: 'Search' }));

    expect(await screen.findByRole('heading', { name: 'Climate paper 1' })).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(100);
    expect(screen.getByText('100 papers ranked · 250 matches')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Publication date' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('submits the research description and displays keywords and every Jev-ranked candidate', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(makeResponse({
      totalResults: 4,
      returnedResults: 4,
      extractedKeywords: [
        { phrase: 'human evaluation', score: 0.91 },
        { phrase: 'retrieval quality', score: 0.84 },
      ],
      results: [
        { ...paper, title: 'Highly relevant work', semanticScore: 0.8734 },
        { ...paper, openAlexId: 'https://openalex.org/W2', title: 'Borderline relevant work', semanticScore: 0.5 },
        { ...paper, openAlexId: 'https://openalex.org/W3', title: 'Low relevance work', semanticScore: 0.12 },
        { ...paper, openAlexId: 'https://openalex.org/W4', title: 'Very low relevance work', semanticScore: 0.03 },
      ],
    })), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderApp();

    await user.type(screen.getByLabelText('Describe your research topic'), validEvaluationDescription);
    await user.click(screen.getByRole('button', { name: 'Search' }));

    expect(await screen.findByRole('heading', { name: 'Highly relevant work' })).toBeInTheDocument();
    expect(screen.getByText('Borderline relevant work')).toBeInTheDocument();
    expect(screen.getByText('Low relevance work')).toBeInTheDocument();
    expect(screen.getByText('Very low relevance work')).toBeInTheDocument();
    expect(screen.getByText('AI match: 87%')).toBeInTheDocument();
    expect(screen.getByText('4 papers ranked · 4 matches')).toBeInTheDocument();
    const keywordList = screen.getByRole('list', { name: 'Extracted keywords' });
    const humanEvaluationBadge = within(keywordList).getByTitle('Relevance score: 91%');
    const retrievalQualityBadge = within(keywordList).getByTitle('Relevance score: 84%');
    expect(humanEvaluationBadge).toHaveTextContent(/human evaluation\s*·\s*91%/);
    expect(retrievalQualityBadge).toHaveTextContent(/retrieval quality\s*·\s*84%/);
    const encodedDescription = encodeQueryValue(validEvaluationDescription);
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/search?q=${encodedDescription}&limit=100&filter=${encodedDescription}`,
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  it('does not show an extracted-keyword section when the API returns no keywords', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(makeResponse({ extractedKeywords: [] })), { status: 200 })));
    const user = userEvent.setup();
    renderApp();

    await user.type(screen.getByLabelText('Describe your research topic'), validResearchDescription);
    await user.click(screen.getByRole('button', { name: 'Search' }));

    expect(await screen.findByRole('heading', { name: 'Climate adaptation strategies' })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Extracted keywords' })).not.toBeInTheDocument();
  });

  it('offers Google Scholar-style year choices and submits the selected year', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(makeResponse()), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    const currentYear = new Date().getFullYear();
    renderApp();

    const yearFilter = screen.getByRole('combobox', { name: 'Publication date' });
    expect(yearFilter).toHaveDisplayValue('Any time');
    expect(screen.getByRole('option', { name: `Since ${currentYear}` })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: `Since ${currentYear - 1}` })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: `Since ${currentYear - 4}` })).toBeInTheDocument();

    await user.type(screen.getByLabelText('Describe your research topic'), validResearchDescription);
    await user.selectOptions(yearFilter, String(currentYear - 4));
    await user.click(screen.getByRole('button', { name: 'Search' }));

    expect(await screen.findByRole('heading', { name: 'Climate adaptation strategies' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/search?q=${encodeQueryValue(validResearchDescription)}&limit=100&filter=${encodeQueryValue(validResearchDescription)}&fromYear=${currentYear - 4}`,
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  it('shows the normal empty state and returns focus to a new search', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(makeResponse({ totalResults: 0, returnedResults: 0, results: [] })), { status: 200 })));
    const user = userEvent.setup();
    renderApp();

    await user.type(
      screen.getByLabelText('Describe your research topic'),
      'unknown research topic involving several uncommon concepts without matching academic papers',
    );
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Publication date' }),
      String(new Date().getFullYear() - 1),
    );
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText('No papers found for this search')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start a new search' }));
    expect(screen.getByLabelText('Describe your research topic')).toHaveFocus();
    expect(screen.getByLabelText('Describe your research topic')).toHaveValue('');
    expect(screen.getByRole('combobox', { name: 'Publication date' })).toHaveDisplayValue('Any time');
  });

  it('requires at least ten words before submitting', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderApp();

    await user.type(screen.getByLabelText('Describe your research topic'), 'one two three four five six seven eight nine');
    await user.click(screen.getByRole('button', { name: 'Search' }));

    expect(screen.getByText('Enter at least 10 words (9/10).')).toBeInTheDocument();
    expect(screen.getByLabelText('Describe your research topic')).toHaveFocus();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('runs the same search again after results are displayed', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(makeResponse()), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderApp();

    await user.type(screen.getByLabelText('Describe your research topic'), validResearchDescription);
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByRole('heading', { name: 'Climate adaptation strategies' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Search' }));

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
