import { useEffect, useRef, useState, type FormEvent } from 'react';
import { SEARCH_MIN_WORDS, countSearchWords, type JournalQuality } from '@openalex/shared';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

interface SearchDraft {
  query: string;
  fromYear: string;
  journalQuality: JournalQuality;
}

export interface SubmittedSearchInput {
  query: string;
  fromYear?: number;
  journalQuality: JournalQuality;
}

interface SearchFormProps {
  isFetching: boolean;
  onSubmit: (search: SubmittedSearchInput) => void;
  resetKey: number;
}

const createEmptySearchDraft = (): SearchDraft => ({
  query: '',
  fromYear: '',
  journalQuality: 'any',
});

const buildYearOptions = (currentYear: number) => [
  { value: '', label: 'Any time' },
  { value: String(currentYear), label: `Since ${currentYear}` },
  { value: String(currentYear - 1), label: `Since ${currentYear - 1}` },
  { value: String(currentYear - 4), label: `Since ${currentYear - 4}` },
];

const journalQualityOptions: Array<{ value: JournalQuality; label: string }> = [
  { value: 'any', label: 'Any journal' },
  { value: 'q1', label: 'Q1' },
  { value: 'q1-q2', label: 'Q1–Q2' },
  { value: 'ranked', label: 'Ranked journals only' },
  { value: 'include-unranked', label: 'Include unranked journals' },
];

export const SearchForm = ({ isFetching, onSubmit, resetKey }: SearchFormProps) => {
  const yearOptions = buildYearOptions(new Date().getFullYear());
  const [draft, setDraft] = useState<SearchDraft>(createEmptySearchDraft);
  const [showValidation, setShowValidation] = useState(false);
  const searchInputRef = useRef<HTMLTextAreaElement>(null);

  const queryWordCount = countSearchWords(draft.query);
  const isInvalid = queryWordCount < SEARCH_MIN_WORDS;

  useEffect(() => {
    if (resetKey > 0) {
      setDraft(createEmptySearchDraft());
      setShowValidation(false);
      searchInputRef.current?.focus();
    }
  }, [resetKey]);

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextQuery = draft.query.trim();
    if (countSearchWords(nextQuery) < SEARCH_MIN_WORDS) {
      setShowValidation(true);
      searchInputRef.current?.focus();
      return;
    }

    setShowValidation(false);
    onSubmit({
      query: nextQuery,
      fromYear: draft.fromYear ? Number(draft.fromYear) : undefined,
      journalQuality: draft.journalQuality,
    });
  };

  return (
    <form onSubmit={submitSearch} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="paper-query">Describe your research topic</Label>
        <Textarea
          ref={searchInputRef}
          id="paper-query"
          value={draft.query}
          onChange={(event) => {
            const query = event.target.value;
            setDraft((current) => ({ ...current, query }));
            if (showValidation && countSearchWords(query) >= SEARCH_MIN_WORDS) {
              setShowValidation(false);
            }
          }}
          placeholder="e.g. meta-learning for scarce medical images using foundation models"
          rows={4}
          required
          autoFocus
          aria-invalid={showValidation && isInvalid}
          aria-describedby={showValidation && isInvalid ? 'query-error' : undefined}
        />
        {showValidation && isInvalid && (
          <p id="query-error" className="text-xs font-medium text-destructive">
            Enter at least {SEARCH_MIN_WORDS} words ({queryWordCount}/{SEARCH_MIN_WORDS}).
          </p>
        )}
      </div>

      <div className="flex flex-col gap-4 pt-1 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid flex-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:max-w-52">
            <Label htmlFor="journal-quality">SJR quartile</Label>
            <Select
              id="journal-quality"
              value={draft.journalQuality}
              onChange={(event) => setDraft((current) => ({
                ...current,
                journalQuality: event.target.value as JournalQuality,
              }))}
            >
              {journalQualityOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-2 sm:max-w-52">
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
        </div>
        <Button type="submit" disabled={isFetching} className="h-10 min-w-28 gap-2">
          {!isFetching && <Search className="h-4 w-4" aria-hidden="true" />}
          {isFetching ? 'Searching…' : 'Search'}
        </Button>
      </div>
    </form>
  );
};
