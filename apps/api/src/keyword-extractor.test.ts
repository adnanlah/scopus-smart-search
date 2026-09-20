import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  generateKeywordCandidates,
  KeyBertKeywordExtractor,
  selectSearchKeywords,
  TransformersTextEmbedder,
  type FeatureExtractor,
  type TextEmbedder,
  type TransformerPipelineBackend,
} from './keyword-extractor.js';

const createPipeline = (): FeatureExtractor => vi.fn(async (inputs: string[]) => ({
  data: Float32Array.from(inputs.flatMap(() => [1, 0])),
  dims: [inputs.length, 2],
}));

const createBackend = (load: TransformerPipelineBackend['load']): TransformerPipelineBackend => ({
  load,
  getCacheDirectory: vi.fn().mockResolvedValue(path.resolve('transformers-test-cache')),
  removeFile: vi.fn().mockResolvedValue(undefined),
});

describe('generateKeywordCandidates', () => {
  it('normalizes text and returns one-word candidates', () => {
    expect(generateKeywordCandidates('Human evaluations of Retrieval-Augmented Generation!')).toEqual([
      'human',
      'evaluations',
      'retrieval-augmented',
      'generation',
    ]);
  });
  it('removes stop words and numeric candidates without joining phrases across them', () => {
    expect(generateKeywordCandidates('The quality of 12 studies and their results.')).toEqual([
      'quality',
      'studies',
      'results',
    ]);
  });

  it('keeps review as a candidate from a natural research request', () => {
    const candidates = generateKeywordCandidates(
      'review papers about meta-learning paradigm to solve medical images being scarce',
    );

    expect(candidates).toContain('review');
  });

  it('keeps data as a keyword when it carries domain meaning', () => {
    const selected = selectSearchKeywords([
      { phrase: 'data', score: 0.8 },
      { phrase: 'scarcity', score: 0.7 },
    ]);

    expect(selected.map(({ phrase }) => phrase)).toContain('data');
  });
  it('prioritizes repeated candidates, deduplicates them, and caps the pool', () => {
    const uniqueWords = Array.from({ length: 300 }, (_, index) => `term${index}`).join(', ');
    const candidates = generateKeywordCandidates(`relevance relevance relevance. ${uniqueWords}`);

    expect(candidates[0]).toBe('relevance');
    expect(new Set(candidates).size).toBe(candidates.length);
    expect(candidates).toHaveLength(256);
  });
});

describe('selectSearchKeywords', () => {
  it('sorts by relevance, removes generic and plural duplicates, keeps review, and keeps the top ten', () => {
    const keywords = [
      { phrase: 'papers', score: 0.99 },
      { phrase: 'image', score: 0.7 },
      { phrase: 'Images', score: 0.95 },
      { phrase: 'reviews', score: 0.94 },
      ...Array.from({ length: 12 }, (_, index) => ({ phrase: `term${index}`, score: 0.9 - index / 100 })),
    ];

    const selected = selectSearchKeywords(keywords);

    expect(selected).toHaveLength(10);
    expect(selected[0]).toEqual({ phrase: 'images', score: 0.95 });
    expect(selected.map(({ phrase }) => phrase)).not.toContain('image');
    expect(selected.map(({ phrase }) => phrase)).not.toContain('papers');
    expect(selected.map(({ phrase }) => phrase)).toContain('reviews');
    expect(selected.map(({ score }) => score)).toEqual([...selected.map(({ score }) => score)].sort((a, b) => b - a));
  });

  it('orders selected keywords by their original position when a source query is provided', () => {
    const selected = selectSearchKeywords([
      { phrase: 'models', score: 0.99 },
      { phrase: 'images', score: 0.95 },
      { phrase: 'meta-learning', score: 0.9 },
    ], 10, 'meta-learning for medical images using foundation models');

    expect(selected.map(({ phrase }) => phrase)).toEqual(['meta-learning', 'images', 'models']);
  });
  it('removes lower-ranked terms contained by a stronger phrase', () => {
    const selected = selectSearchKeywords([
      { phrase: 'Medical Images', score: 0.95 },
      { phrase: 'images', score: 0.9 },
      { phrase: 'medical', score: 0.85 },
      { phrase: 'foundation models', score: 0.8 },
      { phrase: 'models', score: 0.75 },
    ]);

    expect(selected.map(({ phrase }) => phrase)).toEqual(['images', 'medical', 'models']);
  });

  it('prefers longer phrases on score ties and canonicalizes punctuation and plurals', () => {
    const selected = selectSearchKeywords([
      { phrase: 'meta', score: 0.9 },
      { phrase: 'Meta-Learning', score: 0.9 },
      { phrase: 'meta learning', score: 0.85 },
      { phrase: 'learning', score: 0.8 },
      { phrase: 'image', score: 0.7 },
      { phrase: 'images', score: 0.6 },
    ]);

    expect(selected.map(({ phrase }) => phrase)).toEqual(['meta', 'meta-learning', 'learning', 'image']);
  });

  it('keeps distinct partially overlapping phrases', () => {
    const selected = selectSearchKeywords([
      { phrase: 'machine learning', score: 0.9 },
      { phrase: 'deep learning', score: 0.85 },
    ]);

    expect(selected.map(({ phrase }) => phrase)).toEqual([]);
  });

  it('allows relevant generic phrases but removes weak ones and generic standalone terms', () => {
    const selected = selectSearchKeywords([
      { phrase: 'review papers', score: 0.81 },
      { phrase: 'review', score: 0.79 },
      { phrase: 'papers', score: 0.78 },
      { phrase: 'using foundation', score: 0.39 },
      { phrase: 'foundation models', score: 0.85 },
    ]);

    expect(selected.map(({ phrase }) => phrase)).toEqual(['review']);
  });

  it('allows relevant unseen phrases containing generic terms without special cases', () => {
    const selected = selectSearchKeywords([
      { phrase: 'clinical studies', score: 0.76 },
      { phrase: 'survey articles', score: 0.71 },
      { phrase: 'studies', score: 0.7 },
      { phrase: 'articles', score: 0.69 },
    ]);

    expect(selected.map(({ phrase }) => phrase)).toEqual([]);
  });
});

describe('KeyBertKeywordExtractor', () => {
  it('returns immediately for blank input without initializing embeddings', async () => {
    const embedder: TextEmbedder = { embed: vi.fn() };
    const extractor = new KeyBertKeywordExtractor(embedder);

    await expect(extractor.extract('   ')).resolves.toEqual([]);
    expect(embedder.embed).not.toHaveBeenCalled();
  });

  it('orders phrases by cosine similarity and returns at most ten scored results', async () => {
    const embed = vi.fn(async (texts: string[]) => texts.map((_, index) => (
      index === 0 ? [1, 0] : [1 - index / texts.length, index / texts.length]
    )));
    const extractor = new KeyBertKeywordExtractor({ embed });

    const result = await extractor.extract('alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu');

    expect(embed).toHaveBeenCalledOnce();
    expect(result).toHaveLength(10);
    expect(result[0]).toMatchObject({ phrase: 'alpha' });
    expect(result.every(({ phrase, score }) => phrase.split(' ').length <= 1 && Number.isFinite(score))).toBe(true);
    expect(result.map(({ score }) => score)).toEqual([...result.map(({ score }) => score)].sort((a, b) => b - a));
  });
});

describe('TransformersTextEmbedder', () => {
  it('loads the q8 pipeline once and reuses it across embedding requests', async () => {
    const pipeline = createPipeline();
    const backend = createBackend(vi.fn().mockResolvedValue(pipeline));
    const embedder = new TransformersTextEmbedder(backend);

    await expect(embedder.embed(['first'])).resolves.toEqual([[1, 0]]);
    await expect(embedder.embed(['second'])).resolves.toEqual([[1, 0]]);

    expect(backend.load).toHaveBeenCalledOnce();
    expect(backend.load).toHaveBeenCalledWith('Xenova/all-MiniLM-L6-v2', 'q8');
    expect(backend.getCacheDirectory).not.toHaveBeenCalled();
    expect(backend.removeFile).not.toHaveBeenCalled();
    expect(pipeline).toHaveBeenCalledTimes(2);
  });

  it('removes the expected corrupt q8 model and retries loading once', async () => {
    const cacheDirectory = path.resolve('transformers-test-cache');
    const cachedModel = path.join(cacheDirectory, 'Xenova', 'all-MiniLM-L6-v2', 'onnx', 'model_quantized.onnx');
    const pipeline = createPipeline();
    const load = vi.fn()
      .mockRejectedValueOnce(new Error(`Load model from ${cachedModel} failed:Protobuf parsing failed.`))
      .mockResolvedValueOnce(pipeline);
    const backend = createBackend(load);
    const embedder = new TransformersTextEmbedder(backend);

    await expect(embedder.embed(['recovered'])).resolves.toEqual([[1, 0]]);

    expect(backend.removeFile).toHaveBeenCalledOnce();
    expect(backend.removeFile).toHaveBeenCalledWith(cachedModel);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('does not remove cache files or retry unrelated loading errors', async () => {
    const loadError = new Error('Network request failed.');
    const backend = createBackend(vi.fn().mockRejectedValue(loadError));
    const embedder = new TransformersTextEmbedder(backend);

    await expect(embedder.embed(['failure'])).rejects.toBe(loadError);

    expect(backend.load).toHaveBeenCalledOnce();
    expect(backend.getCacheDirectory).not.toHaveBeenCalled();
    expect(backend.removeFile).not.toHaveBeenCalled();
  });

  it('stops after one retry when the replacement model also fails to load', async () => {
    const cacheDirectory = path.resolve('transformers-test-cache');
    const cachedModel = path.join(cacheDirectory, 'Xenova', 'all-MiniLM-L6-v2', 'onnx', 'model_quantized.onnx');
    const firstError = new Error(`Load model from ${cachedModel} failed:Protobuf parsing failed.`);
    const secondError = new Error(`Load model from ${cachedModel} failed:Protobuf parsing failed again.`);
    const backend = createBackend(vi.fn().mockRejectedValueOnce(firstError).mockRejectedValueOnce(secondError));
    const embedder = new TransformersTextEmbedder(backend);

    await expect(embedder.embed(['failure'])).rejects.toBe(secondError);

    expect(backend.load).toHaveBeenCalledTimes(2);
    expect(backend.removeFile).toHaveBeenCalledOnce();
  });
});
