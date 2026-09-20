import { rm } from 'node:fs/promises';
import path from 'node:path';
import type { ExtractedKeyword } from '@openalex/shared';

const DEFAULT_MODEL = 'Xenova/all-MiniLM-L6-v2';
const MODEL_DTYPE = 'q8';
const QUANTIZED_MODEL_FILE = 'model_quantized.onnx';
const MAX_CANDIDATES = 256;
const MAX_KEYWORD_WORDS = 1;
const MAX_NGRAM_SIZE = MAX_KEYWORD_WORDS;
const TOP_KEYWORDS = 10;
const GENERIC_PHRASE_MIN_SCORE = 0.4;
const TOKEN_PATTERN = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;

const GENERIC_SEARCH_TERMS = new Set([
  'article', 'author', 'finding', 'literature', 'method', 'paper',
  'research', 'result', 'study', 'use', 'using', 'want', 'work',
]);

const ENGLISH_STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', "aren't", 'as', 'at',
  'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by',
  'can', "can't", 'cannot', 'could', "couldn't", 'did', "didn't", 'do', 'does', "doesn't", 'doing', "don't", 'down', 'during',
  'each', 'few', 'for', 'from', 'further', 'had', "hadn't", 'has', "hasn't", 'have', "haven't", 'having',
  'he', "he'd", "he'll", "he's", 'her', 'here', "here's", 'hers', 'herself', 'him', 'himself', 'his',
  'how', "how's", 'i', "i'd", "i'll", "i'm", "i've", 'if', 'in', 'into', 'is', "isn't", 'it', "it's", 'its', 'itself',
  "let's", 'me', 'more', 'most', "mustn't", 'my', 'myself', 'no', 'nor', 'not', 'of', 'off', 'on', 'once', 'only', 'or',
  'other', 'ought', 'our', 'ours', 'ourselves', 'out', 'over', 'own', 'same', "shan't", 'she', "she'd", "she'll", "she's",
  'should', "shouldn't", 'so', 'some', 'such', 'than', 'that', "that's", 'the', 'their', 'theirs', 'them', 'themselves',
  'then', 'there', "there's", 'these', 'they', "they'd", "they'll", "they're", "they've", 'this', 'those', 'through',
  'to', 'too', 'under', 'until', 'up', 'very', 'was', "wasn't", 'we', "we'd", "we'll", "we're", "we've", 'were',
  "weren't", 'what', "what's", 'when', "when's", 'where', "where's", 'which', 'while', 'who', "who's", 'whom',
  'why', "why's", 'with', "won't", 'would', "wouldn't", 'you', "you'd", "you'll", "you're", "you've", 'your',
  'yours', 'yourself', 'yourselves',
]);

interface CandidateMetadata {
  phrase: string;
  occurrences: number;
  firstPosition: number;
}

interface TensorLike {
  data: ArrayLike<number>;
  dims: number[];
}

export type FeatureExtractor = (
  inputs: string[],
  options: { pooling: 'mean'; normalize: true },
) => Promise<unknown>;

export interface TransformerPipelineBackend {
  load(model: string, dtype: typeof MODEL_DTYPE): Promise<FeatureExtractor>;
  getCacheDirectory(): Promise<string>;
  removeFile(filePath: string): Promise<void>;
}

export interface TextEmbedder {
  embed(texts: string[]): Promise<number[][]>;
}

export interface KeywordExtractor {
  extract(text: string): Promise<ExtractedKeyword[]>;
}

const isTensorLike = (value: unknown): value is TensorLike => {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<TensorLike>;
  return Array.isArray(candidate.dims)
    && candidate.dims.every((dimension) => Number.isInteger(dimension) && dimension >= 0)
    && candidate.data !== undefined
    && typeof candidate.data.length === 'number';
};

const splitIntoContentRuns = (text: string): string[][] => {
  const normalized = text.normalize('NFKC').toLowerCase().replace(/[\u2018\u2019]/g, "'");
  const matches = [...normalized.matchAll(TOKEN_PATTERN)];
  const runs: string[][] = [];
  let currentRun: string[] = [];
  let previousEnd = 0;

  // Stop words, numbers, and punctuation form boundaries so generated n-grams
  // never join otherwise unrelated terms from opposite sides of the boundary.
  for (const match of matches) {
    const token = match[0];
    const start = match.index;
    const separatedByPunctuation = currentRun.length > 0 && /\S/u.test(normalized.slice(previousEnd, start));
    const isStopWord = ENGLISH_STOP_WORDS.has(token);
    const isNumber = /^\p{N}+$/u.test(token);

    if (separatedByPunctuation || isStopWord || isNumber) {
      if (currentRun.length > 0) runs.push(currentRun);
      currentRun = [];
    }
    if (!isStopWord && !isNumber) currentRun.push(token);
    previousEnd = start + token.length;
  }

  if (currentRun.length > 0) runs.push(currentRun);
  return runs;
};

export const generateKeywordCandidates = (text: string): string[] => {
  const candidates = new Map<string, CandidateMetadata>();
  let position = 0;

  for (const run of splitIntoContentRuns(text)) {
    for (let start = 0; start < run.length; start += 1) {
      for (let size = 1; size <= MAX_NGRAM_SIZE && start + size <= run.length; size += 1) {
        const phrase = run.slice(start, start + size).join(' ');
        const existing = candidates.get(phrase);
        if (existing) {
          existing.occurrences += 1;
        } else {
          candidates.set(phrase, { phrase, occurrences: 1, firstPosition: position });
        }
        position += 1;
      }
    }
  }

  return [...candidates.values()]
    .sort((left, right) => right.occurrences - left.occurrences || left.firstPosition - right.firstPosition)
    .slice(0, MAX_CANDIDATES)
    .map(({ phrase }) => phrase);
};

const normalizeKeyword = (phrase: string): string =>
  phrase.normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim();

const singularizeKeyword = (keyword: string): string => {
  if (keyword.length > 4 && keyword.endsWith('ies')) return `${keyword.slice(0, -3)}y`;
  if (keyword.length > 4 && /(ches|shes|ses|xes|zes)$/u.test(keyword)) return keyword.slice(0, -2);
  if (keyword.length > 3 && keyword.endsWith('s') && !/(ss|us|is)$/u.test(keyword)) return keyword.slice(0, -1);
  return keyword;
};

const canonicalKeywordTokens = (phrase: string): string[] =>
  normalizeKeyword(phrase)
    .match(TOKEN_PATTERN)
    ?.map(singularizeKeyword) ?? [];

const containsAllTokens = (container: Set<string>, tokens: string[]): boolean =>
  tokens.every((token) => container.has(token));

export const selectSearchKeywords = (
  keywords: ExtractedKeyword[],
  limit = TOP_KEYWORDS,
  sourceQuery?: string,
): ExtractedKeyword[] => {
  const seen = new Set<string>();
  const selectedTokenSets: Set<string>[] = [];

  const selected = keywords
    .map(({ phrase, score }) => {
      const normalizedPhrase = normalizeKeyword(phrase);
      return { phrase: normalizedPhrase, score, tokens: canonicalKeywordTokens(normalizedPhrase) };
    })
    .filter(({ phrase, score, tokens }) => phrase.length > 0 && Number.isFinite(score) && tokens.length > 0 && tokens.length <= MAX_KEYWORD_WORDS)
    .sort((left, right) => right.score - left.score || right.tokens.length - left.tokens.length)
    .filter(({ score, tokens }) => {
      const identity = tokens.join(' ');
      const containsGenericTerm = tokens.some((token) => GENERIC_SEARCH_TERMS.has(token));
      const isGenericStandalone = tokens.length === 1 && containsGenericTerm;
      const isWeakGenericPhrase = tokens.length > 1
        && containsGenericTerm
        && score < GENERIC_PHRASE_MIN_SCORE;

      if (isGenericStandalone || isWeakGenericPhrase || seen.has(identity)) return false;

      // A lower-ranked unigram (or equivalent shorter phrase) adds no search
      // signal when every canonical token is already present in a selected phrase.
      if (selectedTokenSets.some((selectedTokens) => containsAllTokens(selectedTokens, tokens))) return false;

      seen.add(identity);
      selectedTokenSets.push(new Set(tokens));
      return true;
    })
    .map(({ phrase, score }) => ({ phrase, score }))
    .slice(0, Math.max(0, limit));

  if (!sourceQuery) return selected;

  const sourcePositions = new Map<string, number>();
  const normalizedSourceQuery = normalizeKeyword(sourceQuery);
  for (const match of normalizedSourceQuery.matchAll(TOKEN_PATTERN)) {
    const token = singularizeKeyword(match[0]);
    if (!sourcePositions.has(token)) sourcePositions.set(token, match.index ?? Number.MAX_SAFE_INTEGER);
  }

  return selected.sort((left, right) => {
    const leftPosition = sourcePositions.get((canonicalKeywordTokens(left.phrase)[0] ?? '')) ?? Number.MAX_SAFE_INTEGER;
    const rightPosition = sourcePositions.get((canonicalKeywordTokens(right.phrase)[0] ?? '')) ?? Number.MAX_SAFE_INTEGER;
    return leftPosition - rightPosition || right.score - left.score;
  });
};

class HuggingFaceTransformerBackend implements TransformerPipelineBackend {
  public async load(model: string, dtype: typeof MODEL_DTYPE): Promise<FeatureExtractor> {
    const { pipeline } = await import('@huggingface/transformers');
    const extractor = await pipeline('feature-extraction', model, { dtype });
    return extractor as unknown as FeatureExtractor;
  }

  public async getCacheDirectory(): Promise<string> {
    const { env } = await import('@huggingface/transformers');
    return env.cacheDir;
  }

  public async removeFile(filePath: string): Promise<void> {
    await rm(filePath, { force: true });
  }
}

const resolveCachedModelPath = (cacheDirectory: string, model: string): string | undefined => {
  const cacheRoot = path.resolve(cacheDirectory);
  const modelPath = path.resolve(cacheRoot, ...model.split('/'), 'onnx', QUANTIZED_MODEL_FILE);
  const relativePath = path.relative(cacheRoot, modelPath);
  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) return undefined;
  return modelPath;
};

const isProtobufParsingError = (error: unknown): error is Error =>
  error instanceof Error && error.message.includes('Protobuf parsing failed');

const referencesCachedModel = (error: Error, modelPath: string): boolean =>
  error.message.toLowerCase().includes(path.normalize(modelPath).toLowerCase());

export class TransformersTextEmbedder implements TextEmbedder {
  private pipelinePromise?: Promise<FeatureExtractor>;

  public constructor(
    private readonly backend: TransformerPipelineBackend = new HuggingFaceTransformerBackend(),
    private readonly model = DEFAULT_MODEL,
  ) {}

  private async loadPipeline(): Promise<FeatureExtractor> {
    try {
      return await this.backend.load(this.model, MODEL_DTYPE);
    } catch (error) {
      if (!isProtobufParsingError(error)) throw error;
      const cacheDirectory = await this.backend.getCacheDirectory();
      const cachedModelPath = resolveCachedModelPath(cacheDirectory, this.model);
      if (!cachedModelPath || !referencesCachedModel(error, cachedModelPath)) throw error;

      // A killed or interrupted process can leave a partial ONNX file that the
      // Transformers.js filesystem cache still treats as a hit. Remove only the
      // expected q8 artifact and give the remote download one fresh attempt.
      await this.backend.removeFile(cachedModelPath);
      return this.backend.load(this.model, MODEL_DTYPE);
    }
  }

  private getPipeline(): Promise<FeatureExtractor> {
    if (!this.pipelinePromise) {
      const loading = this.loadPipeline();
      this.pipelinePromise = loading.catch((error: unknown) => {
        this.pipelinePromise = undefined;
        throw error;
      });
    }
    return this.pipelinePromise;
  }

  public async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const extractor = await this.getPipeline();
    const output = await extractor(texts, { pooling: 'mean', normalize: true });
    if (!isTensorLike(output) || output.dims.length !== 2 || output.dims[0] !== texts.length) {
      throw new Error('The embedding model returned an unexpected tensor shape.');
    }

    const dimensions = output.dims[1];
    if (!dimensions || output.data.length !== texts.length * dimensions) {
      throw new Error('The embedding model returned incomplete vectors.');
    }

    return texts.map((_, index) => Array.from(
      { length: dimensions },
      (unused, dimension) => Number(output.data[index * dimensions + dimension]),
    ));
  }
}

const dotProduct = (left: number[], right: number[]): number => {
  if (left.length !== right.length) throw new Error('Embedding vectors have inconsistent dimensions.');
  return left.reduce((sum, value, index) => sum + value * (right[index] ?? 0), 0);
};

export class KeyBertKeywordExtractor implements KeywordExtractor {
  public constructor(private readonly embedder: TextEmbedder = new TransformersTextEmbedder()) {}

  public async extract(text: string): Promise<ExtractedKeyword[]> {
    const normalizedText = text.normalize('NFKC').replace(/\s+/gu, ' ').trim();
    if (!normalizedText) return [];

    const candidates = generateKeywordCandidates(normalizedText);
    if (candidates.length === 0) return [];

    const [documentVector, ...candidateVectors] = await this.embedder.embed([normalizedText, ...candidates]);
    if (!documentVector || candidateVectors.length !== candidates.length) {
      throw new Error('The embedding model returned an unexpected number of vectors.');
    }

    const scoredKeywords = candidates
      .map((phrase, index) => ({
        phrase,
        score: Math.max(-1, Math.min(1, dotProduct(documentVector, candidateVectors[index] ?? []))),
        order: index,
      }))
      .filter(({ score }) => Number.isFinite(score))
      .sort((left, right) => right.score - left.score || left.order - right.order)
      .map(({ phrase, score }) => ({ phrase, score }));

    return selectSearchKeywords(scoredKeywords);
  }
}
