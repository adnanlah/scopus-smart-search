import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import { TypeSafeClient } from '@typesafe-ai/sdk';
import { OpenAlexClient, OpenAlexClientError } from '@openalex/openalex-client';
import type { SearchResponse } from '@openalex/shared';
import { z } from 'zod';
import { loadConfig, type AppConfig } from './config.js';
import { JEV_MODEL, JevSemanticFilter, TypeSafeJevClient, type SemanticFilter } from './jev.js';

const searchQuerySchema = z.object({
  q: z.string().trim().min(1, 'Query parameter q is required.').max(2_000, 'Query is too long.'),
  filter: z.string().trim().max(2_000, 'Filter is too long.').optional(),
  limit: z.coerce.number().int().min(1).max(100).default(100),
});

const errorBody = (code: string, message: string) => ({ error: { code, message } });

const createSemanticFilter = (config: AppConfig, injected?: SemanticFilter): SemanticFilter | undefined => {
  if (injected) return injected;
  if (!config.typesafeApiKey) return undefined;
  return new JevSemanticFilter(new TypeSafeJevClient(new TypeSafeClient({
    apiKey: config.typesafeApiKey,
    defaultModel: JEV_MODEL,
  })));
};

export interface ServerDependencies {
  client?: OpenAlexClient;
  semanticFilter?: SemanticFilter;
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
  const semanticFilter = createSemanticFilter(config, dependencies.semanticFilter);

  await server.register(cors, { origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(',').map((origin) => origin.trim()) });

  server.get('/health', async () => ({ status: 'ok', service: 'openalex-api' }));

  server.get('/api/search', async (request, reply): Promise<SearchResponse | unknown> => {
    const parsed = searchQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send(errorBody('INVALID_QUERY', parsed.error.issues.map((issue) => issue.message).join(' ')));
    }
    try {
      const filter = parsed.data.filter || undefined;
      const response = await client.search(parsed.data.q, filter ? 100 : parsed.data.limit);
      if (!filter) return response;
      if (!semanticFilter) {
        return reply.code(503).send(errorBody('TYPESAFE_NOT_CONFIGURED', 'Semantic filtering is not configured on the search service.'));
      }
      try {
        const filteredResults = await semanticFilter.filter(response.results, filter);
        return { ...response, returnedResults: filteredResults.length, results: filteredResults };
      } catch (error) {
        const status = typeof error === 'object' && error !== null && 'status' in error && error.status === 429 ? 429 : 502;
        request.log.error(error);
        return reply.code(status).send(errorBody('TYPESAFE_REQUEST_FAILED', 'Semantic filtering could not be completed.'));
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
