import { noul, type Questions } from '@typesafe-ai/sdk';
import type {
  SearchConstraint,
  SearchConstraintStatus,
  SearchConstraintType,
  SearchInterpretation,
} from '@openalex/shared';
import type { JevClient } from './jev.js';

export const JEV_CONSTRAINT_THRESHOLD = 0.8;

type Candidate = {
  type: SearchConstraintType;
  value: string;
  label: string;
  filter: string;
  aliases?: string[];
};

const candidates: Candidate[] = [
  { type: 'work_type', value: 'article', label: 'Article', filter: 'type:article', aliases: ['article', 'journal article'] },
  { type: 'work_type', value: 'review', label: 'Review', filter: 'type:review', aliases: ['review', 'review paper', 'literature review'] },
  { type: 'work_type', value: 'preprint', label: 'Preprint', filter: 'type:preprint', aliases: ['preprint', 'working paper'] },
  { type: 'work_type', value: 'book', label: 'Book', filter: 'type:book', aliases: ['book'] },
  { type: 'work_type', value: 'book-chapter', label: 'Book chapter', filter: 'type:book-chapter', aliases: ['book chapter', 'chapter'] },
  { type: 'work_type', value: 'dataset', label: 'Dataset', filter: 'type:dataset', aliases: ['dataset', 'data set'] },
  { type: 'work_type', value: 'dissertation', label: 'Dissertation', filter: 'type:dissertation', aliases: ['dissertation', 'doctoral dissertation'] },
  { type: 'work_type', value: 'editorial', label: 'Editorial', filter: 'type:editorial', aliases: ['editorial'] },
  { type: 'work_type', value: 'letter', label: 'Letter', filter: 'type:letter', aliases: ['letter'] },
  { type: 'work_type', value: 'report', label: 'Report', filter: 'type:report', aliases: ['report', 'technical report'] },
  { type: 'work_type', value: 'thesis', label: 'Thesis', filter: 'type:thesis', aliases: ['thesis'] },
  { type: 'work_type', value: 'software', label: 'Software', filter: 'type:software', aliases: ['software', 'code'] },
  { type: 'work_type', value: 'other', label: 'Other work', filter: 'type:other', aliases: ['other work'] },

  { type: 'domain', value: '1', label: 'Life sciences', filter: 'topics.domain.id:1', aliases: ['life sciences', 'biology', 'biological sciences'] },
  { type: 'domain', value: '2', label: 'Social sciences', filter: 'topics.domain.id:2', aliases: ['social sciences', 'social science'] },
  { type: 'domain', value: '3', label: 'Physical sciences', filter: 'topics.domain.id:3', aliases: ['physical sciences', 'physical science'] },
  { type: 'domain', value: '4', label: 'Health sciences', filter: 'topics.domain.id:4', aliases: ['health sciences', 'health science', 'healthcare'] },

  { type: 'field', value: '11', label: 'Agricultural and biological sciences', filter: 'topics.field.id:11', aliases: ['agricultural sciences', 'agriculture', 'biological sciences'] },
  { type: 'field', value: '12', label: 'Arts and humanities', filter: 'topics.field.id:12', aliases: ['arts and humanities', 'humanities', 'arts'] },
  { type: 'field', value: '13', label: 'Biochemistry, genetics and molecular biology', filter: 'topics.field.id:13', aliases: ['biochemistry', 'genetics', 'molecular biology'] },
  { type: 'field', value: '14', label: 'Business, management and accounting', filter: 'topics.field.id:14', aliases: ['business', 'management', 'accounting'] },
  { type: 'field', value: '15', label: 'Chemical engineering', filter: 'topics.field.id:15', aliases: ['chemical engineering'] },
  { type: 'field', value: '16', label: 'Chemistry', filter: 'topics.field.id:16', aliases: ['chemistry'] },
  { type: 'field', value: '17', label: 'Computer science', filter: 'topics.field.id:17', aliases: ['computer science', 'computing', 'informatics'] },
  { type: 'field', value: '18', label: 'Decision sciences', filter: 'topics.field.id:18', aliases: ['decision sciences'] },
  { type: 'field', value: '19', label: 'Dentistry', filter: 'topics.field.id:19', aliases: ['dentistry', 'dental'] },
  { type: 'field', value: '20', label: 'Earth and planetary sciences', filter: 'topics.field.id:20', aliases: ['earth science', 'geology', 'planetary science'] },
  { type: 'field', value: '21', label: 'Economics, econometrics and finance', filter: 'topics.field.id:21', aliases: ['economics', 'econometrics', 'finance'] },
  { type: 'field', value: '22', label: 'Energy', filter: 'topics.field.id:22', aliases: ['energy'] },
  { type: 'field', value: '23', label: 'Engineering', filter: 'topics.field.id:23', aliases: ['engineering'] },
  { type: 'field', value: '24', label: 'Environmental science', filter: 'topics.field.id:24', aliases: ['environmental science', 'environment', 'climate'] },
  { type: 'field', value: '25', label: 'Immunology and microbiology', filter: 'topics.field.id:25', aliases: ['immunology', 'microbiology'] },
  { type: 'field', value: '26', label: 'Materials science', filter: 'topics.field.id:26', aliases: ['materials science', 'materials'] },
  { type: 'field', value: '27', label: 'Mathematics', filter: 'topics.field.id:27', aliases: ['mathematics', 'math'] },
  { type: 'field', value: '28', label: 'Medicine', filter: 'topics.field.id:28', aliases: ['medicine', 'medical', 'clinical'] },
  { type: 'field', value: '29', label: 'Neuroscience', filter: 'topics.field.id:29', aliases: ['neuroscience', 'neural'] },
  { type: 'field', value: '30', label: 'Nursing', filter: 'topics.field.id:30', aliases: ['nursing'] },
  { type: 'field', value: '31', label: 'Pharmacology, toxicology and pharmaceutics', filter: 'topics.field.id:31', aliases: ['pharmacology', 'toxicology', 'pharmaceutics'] },
  { type: 'field', value: '32', label: 'Physics and astronomy', filter: 'topics.field.id:32', aliases: ['physics', 'astronomy'] },
  { type: 'field', value: '33', label: 'Psychology', filter: 'topics.field.id:33', aliases: ['psychology', 'psychological'] },
  { type: 'field', value: '34', label: 'Social sciences', filter: 'topics.field.id:34', aliases: ['social sciences', 'sociology'] },
  { type: 'field', value: '35', label: 'Veterinary science', filter: 'topics.field.id:35', aliases: ['veterinary', 'veterinary science'] },
  { type: 'field', value: '36', label: 'Multidisciplinary', filter: 'topics.field.id:36', aliases: ['multidisciplinary', 'interdisciplinary'] },

  { type: 'language', value: 'en', label: 'English', filter: 'language:en', aliases: ['english'] },
  { type: 'language', value: 'fr', label: 'French', filter: 'language:fr', aliases: ['french', 'français'] },
  { type: 'language', value: 'es', label: 'Spanish', filter: 'language:es', aliases: ['spanish', 'español'] },
  { type: 'language', value: 'de', label: 'German', filter: 'language:de', aliases: ['german', 'deutsch'] },
  { type: 'language', value: 'ar', label: 'Arabic', filter: 'language:ar', aliases: ['arabic'] },
  { type: 'language', value: 'zh', label: 'Chinese', filter: 'language:zh', aliases: ['chinese'] },
  { type: 'language', value: 'ja', label: 'Japanese', filter: 'language:ja', aliases: ['japanese'] },

  { type: 'open_access', value: 'true', label: 'Open access', filter: 'open_access.is_oa:true', aliases: ['open access', 'open-access', 'freely available'] },
];

const QUESTION_CRITERIA = {
  true: 'The query explicitly or implicitly requests this exact constraint.',
  false: 'The query does not request this constraint, or the wording is only incidental.',
};

const cleanQuery = (query: string): string => query.replace(/\s+/g, ' ').trim();
const normalize = (value: string): string => value.toLocaleLowerCase().replace(/[-_]/g, ' ');

const evidenceFor = (query: string, candidate: Candidate): string | undefined => {
  const normalizedQuery = normalize(query);
  const matchedAlias = [candidate.label, ...(candidate.aliases ?? [])]
    .map(normalize)
    .find((alias) => normalizedQuery.includes(alias));
  return matchedAlias ? `Matched “${matchedAlias}” in the query.` : undefined;
};

const buildQuestions = (query: string): Questions => Object.fromEntries(
  candidates.map((candidate) => [
    `${candidate.type}__${candidate.value}`,
    noul(
      `Does the research query ${JSON.stringify(query)} request the OpenAlex constraint “${candidate.label}”? Judge the intended search constraint, not merely whether the word appears. Only answer yes when the wording supports this exact controlled value.`,
      QUESTION_CRITERIA,
    ),
  ]),
);

const getNoulProbability = (answer: unknown): number | undefined => {
  if (typeof answer !== 'object' || answer === null || !('noul' in answer)) return undefined;
  const value = (answer as { noul?: unknown }).noul;
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? value : undefined;
};

const statusFor = (probability: number, threshold: number): SearchConstraintStatus =>
  probability >= threshold ? 'applied' : probability >= 0.5 ? 'ambiguous' : 'below_threshold';

export interface ConstraintInferer {
  infer(query: string): Promise<SearchInterpretation>;
}

export interface ConstraintComposerInput {
  inferred: SearchConstraint[];
  explicit?: SearchConstraint[];
  baseFilters?: string[];
  threshold?: number;
}

export const composeOpenAlexFilters = ({
  inferred,
  explicit = [],
  baseFilters = [],
  threshold = JEV_CONSTRAINT_THRESHOLD,
}: ConstraintComposerInput): { filter?: string; constraints: SearchConstraint[] } => {
  const explicitTypes = new Set(explicit.map((constraint) => constraint.type));
  const constraints = [
    ...explicit.map((constraint) => ({ ...constraint, applied: true, status: 'applied' as const })),
    ...inferred.map((constraint) => {
      if (explicitTypes.has(constraint.type)) return { ...constraint, applied: false, status: 'shadowed_by_explicit' as const };
      if (constraint.source === 'inferred' && (constraint.confidence ?? 0) < threshold) {
        return { ...constraint, applied: false, status: constraint.status === 'ambiguous' ? 'ambiguous' as const : 'below_threshold' as const };
      }
      return constraint;
    }),
  ];
  const grouped = new Map<string, string[]>();
  for (const constraint of constraints) {
    if (!constraint.applied || !constraint.openAlexFilter) continue;
    const separator = constraint.openAlexFilter.indexOf(':');
    if (separator < 1) continue;
    const attribute = constraint.openAlexFilter.slice(0, separator);
    const value = constraint.openAlexFilter.slice(separator + 1);
    if (!value) continue;
    const values = grouped.get(attribute) ?? [];
    values.push(value);
    grouped.set(attribute, values);
  }
  const generatedFilters = [...grouped.entries()]
    .map(([attribute, values]) => `${attribute}:${[...new Set(values)].join('|')}`);
  const filter = [...baseFilters, ...generatedFilters]
    .filter((value, index, values) => Boolean(value) && values.indexOf(value) === index)
    .join(',');
  return { filter: filter || undefined, constraints };
};
export class JevConstraintInferer implements ConstraintInferer {
  public constructor(
    private readonly client: JevClient,
    private readonly threshold = JEV_CONSTRAINT_THRESHOLD,
  ) {}

  public async infer(query: string): Promise<SearchInterpretation> {
    const normalizedQuery = cleanQuery(query);
    if (!normalizedQuery) {
      return { threshold: this.threshold, available: true, constraints: [] };
    }

    const questions = buildQuestions(normalizedQuery);
    const response = await this.client.systemOne({
      model: 'jev-latest',
      state: { query: normalizedQuery },
      questions,
    });

    const inferred = candidates.flatMap((candidate): SearchConstraint[] => {
      const probability = getNoulProbability(response.answers[`${candidate.type}__${candidate.value}`]);
      if (probability === undefined) return [];
      const status = statusFor(probability, this.threshold);
      if (probability < 0.5) return [];
      return [{
        type: candidate.type,
        value: candidate.value,
        label: candidate.label,
        confidence: probability,
        applied: status === 'applied',
        source: 'inferred',
        openAlexFilter: candidate.filter,
        status,
        evidence: evidenceFor(normalizedQuery, candidate) ?? `Inferred from the query semantics.`,
      }];
    });

    return {
      threshold: this.threshold,
      available: true,
      constraints: inferred,
    };
  }
}

export const unavailableInterpretation = (threshold = JEV_CONSTRAINT_THRESHOLD, error?: string): SearchInterpretation => ({
  threshold,
  available: false,
  ...(error ? { error } : {}),
  constraints: [],
});
