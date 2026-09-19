import { noul, TypeSafeClient, type EntryType, type Questions } from '@typesafe-ai/sdk';
import type { WorkResult } from '@openalex/shared';

export const JEV_MODEL = 'jev-latest';
export const SEMANTIC_RELEVANCE_THRESHOLD = 0.5;

const JEV_INCLUSION_CRITERIA = {
  true: [
    'The title or abstract provides sufficient explicit evidence that the',
    'work satisfies the user’s filter instruction and all important conditions.',
  ],
  false: [
    'The work is only topically related, satisfies only part of the instruction,',
    'or would require inferring an unstated property from indirect clues.',
  ],
};

interface JevWorkState {
  id: string;
  title: string;
  abstract: string;
  venue: string;
  publication_year: string;
}

interface JevState {
  filter_instruction: string;
  works: JevWorkState[];
}

interface JevAnswer {
  noul?: unknown;
}

interface JevEvaluation {
  answers: Record<string, JevAnswer>;
}

interface JevRequest {
  model: string;
  state: JevState;
  questions: Questions;
}

export interface JevClient {
  systemOne(request: JevRequest): Promise<JevEvaluation>;
}

export class TypeSafeJevClient implements JevClient {
  public constructor(private readonly client: TypeSafeClient) {}

  public async systemOne(request: JevRequest): Promise<JevEvaluation> {
    const response = await this.client.systemOne({
      model: request.model,
      state: request.state as unknown as EntryType,
      questions: request.questions,
    });
    return response as unknown as JevEvaluation;
  }
}

export interface SemanticFilter {
  filter(works: WorkResult[], instruction: string): Promise<WorkResult[]>;
}

const toJevWorkState = (work: WorkResult, index: number): JevWorkState => ({
  id: work.openAlexId ?? work.identifiers.doi ?? `rank-${work.rank}-${index}`,
  title: work.title ?? '',
  abstract: work.abstract ?? '',
  venue: work.publication.name ?? '',
  publication_year: work.publication.publicationDate?.slice(0, 4)
    ?? work.publication.coverDate?.slice(0, 4)
    ?? '',
});

const buildWorkQuestion = (index: number): Questions[string] => {
  const workPath = `works[${index}]`;
  return noul(
    `Does the work at \`${workPath}\` satisfy the user's filter instruction as a strict inclusion rule, based only on the supplied work metadata? Interpret the user's wording literally. Every important part of the filter must be supported by explicit evidence in \`${workPath}.title\` or \`${workPath}.abstract\`. Do not infer unstated properties, and do not treat merely related topics as satisfying the filter.`,
    JEV_INCLUSION_CRITERIA,
  );
};

const buildQuestions = (workCount: number): Questions => {
  const questions: Questions = {};
  for (let index = 0; index < workCount; index += 1) {
    questions[`work_${index}`] = buildWorkQuestion(index);
  }
  return questions;
};

const readNoulScore = (answer: JevAnswer | undefined, index: number): number => {
  const score = answer?.noul;
  if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 1) {
    throw new Error(`Jev returned an invalid relevance score for work ${index}.`);
  }
  return score;
};

export class JevSemanticFilter implements SemanticFilter {
  public constructor(private readonly client: JevClient) {}

  public async filter(works: WorkResult[], instruction: string): Promise<WorkResult[]> {
    if (works.length === 0) return [];

    const response = await this.client.systemOne({
      model: JEV_MODEL,
      state: {
        filter_instruction: instruction,
        works: works.map(toJevWorkState),
      },
      questions: buildQuestions(works.length),
    });

    return works
      .map((work, index) => {
        const score = readNoulScore(response.answers[`work_${index}`], index);
        return { work: { ...work, semanticScore: score }, score };
      })
      .filter(({ score }) => score >= SEMANTIC_RELEVANCE_THRESHOLD)
      .sort((left, right) => right.score - left.score || left.work.rank - right.work.rank)
      .map(({ work }) => work);
  }
}