import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import { TypeSafeClient } from '@typesafe-ai/sdk';
import { OpenAlexClient, OpenAlexClientError } from '@openalex/openalex-client';
import {
  SEARCH_MIN_WORDS,
  countSearchWords,
  type ExtractedKeyword,
  type SearchResponse,
} from '@openalex/shared';
import { z } from 'zod';
import { loadConfig, type AppConfig } from './config.js';
import { JEV_MODEL, JevSemanticRanker, TypeSafeJevClient, type SemanticRanker } from './jev.js';
import { KeyBertKeywordExtractor, selectSearchKeywords, type KeywordExtractor } from './keyword-extractor.js';

const searchQuerySchema = z.object({
  q: z.string().trim().min(1, 'Query parameter q is required.').max(2_000, 'Query is too long.'),
  filter: z.string()
    .trim()
    .max(2_000, 'Filter is too long.')
    .refine(
      (value) => countSearchWords(value) >= SEARCH_MIN_WORDS,
      `Search description must contain at least ${SEARCH_MIN_WORDS} words.`,
    )
    .optional(),
  fromYear: z.coerce.number().int().min(1800).max(new Date().getFullYear()).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(100),
});

const errorBody = (code: string, message: string) => ({ error: { code, message } });

const buildKeywordQuery = (keywords: ExtractedKeyword[]): string =>
  keywords.map(({ phrase }) => phrase).join(' ');

const createSemanticRanker = (config: AppConfig, injected?: SemanticRanker): SemanticRanker | undefined => {
  if (injected) return injected;
  if (!config.typesafeApiKey) return undefined;
  return new JevSemanticRanker(new TypeSafeJevClient(new TypeSafeClient({
    apiKey: config.typesafeApiKey,
    defaultModel: JEV_MODEL,
  })));
};

export interface ServerDependencies {
  client?: OpenAlexClient;
  semanticRanker?: SemanticRanker;
  keywordExtractor?: KeywordExtractor;
  config?: AppConfig;
}

export const buildServer = async (dependencies: ServerDependencies = {}): Promise<FastifyInstance> => {
  const config = dependencies.config ?? loadConfig();
  const server = Fastify({ logger: true });
  const client = dependencies.client ?? new OpenAlexClient({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    timeoutMs: config.requestTimeoutMs,
    maxRetries: config.maxRetries,
  });
  const semanticRanker = createSemanticRanker(config, dependencies.semanticRanker);
  const keywordExtractor = dependencies.keywordExtractor ?? new KeyBertKeywordExtractor();

  await server.register(cors, { origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(',').map((origin) => origin.trim()) });

  server.get('/health', async () => ({ status: 'ok', service: 'openalex-api' }));

  server.get('/api/search', async (request, reply): Promise<SearchResponse | unknown> => {
    const parsed = searchQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send(errorBody('INVALID_QUERY', parsed.error.issues.map((issue) => issue.message).join(' ')));
    }
    try {
      const rankingPreference = parsed.data.filter || undefined;
      if (rankingPreference && !semanticRanker) {
        return reply.code(503).send(errorBody('TYPESAFE_NOT_CONFIGURED', 'AI reranking is not configured on the search service.'));
      }

      let extractedKeywords: ExtractedKeyword[] = [];
      let openAlexQuery = parsed.data.q;
      if (rankingPreference) {
        try {
          extractedKeywords = selectSearchKeywords(await keywordExtractor.extract(rankingPreference));
        } catch (error) {
          request.log.error(error);
          return reply.code(502).send(errorBody('KEYWORD_EXTRACTION_FAILED', 'Keywords could not be extracted.'));
        }
        openAlexQuery = buildKeywordQuery(extractedKeywords);
        if (!openAlexQuery) {
          return reply.code(400).send(errorBody('NO_SEARCH_KEYWORDS', 'No searchable keywords could be extracted.'));
        }
      }

      console.log('OpenAlex search query:', openAlexQuery);
      const response = await client.search(openAlexQuery, {
        limit: rankingPreference ? 100 : parsed.data.limit,
        fromPublicationYear: parsed.data.fromYear,
      });
      if (!rankingPreference) return response;
      try {
        const rankedResults = await semanticRanker!.rank(response.results, parsed.data.q, rankingPreference);
        return {
          ...response,
          returnedResults: rankedResults.length,
          results: rankedResults,
          extractedKeywords,
        };
      } catch (error) {
        const status = typeof error === 'object'
          && error !== null
          && 'status' in error
          && error.status === 429
          ? 429
          : 502;
        request.log.error(error);
        return reply.code(status).send(errorBody('TYPESAFE_REQUEST_FAILED', 'AI reranking could not be completed.'));
      }
    } catch (error) {
      if (error instanceof OpenAlexClientError) {
        const status = error.status === 429 ? 429 : error.status === 401 || error.status === 403 ? 502 : 502;
        return reply.code(status).send(errorBody(error.code, error.message));
      }
      request.log.error(error);
      return reply.code(502).send(errorBody('OPENALEX_REQUEST_FAILED', 'The OpenAlex request could not be completed.'));
    }
  });

  return server;
};

const start = async (): Promise<void> => {
  const config = loadConfig();
  const server = await buildServer({ config });
  try {
    await server.listen({ port: config.port, host: config.host });
  } catch (error) {
    server.log.error(error);
    process.exitCode = 1;
  }
};

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await start();
}
