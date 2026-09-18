import { z } from 'zod';

const optionalEnvironmentString = z.preprocess(
  (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
  z.string().trim().min(1).optional(),
);

const environmentSchema = z.object({
  OPENALEX_API_KEY: optionalEnvironmentString,
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('127.0.0.1'),
  OPENALEX_BASE_URL: z.string().url().default('https://api.openalex.org'),
  OPENALEX_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  OPENALEX_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
});

export interface AppConfig {
  apiKey?: string;
  port: number;
  host: string;
  baseUrl: string;
  requestTimeoutMs: number;
  maxRetries: number;
  corsOrigin: string;
}

export const loadConfig = (environment: NodeJS.ProcessEnv = process.env): AppConfig => {
  const parsed = environmentSchema.parse(environment);
  return {
    apiKey: parsed.OPENALEX_API_KEY,
    port: parsed.PORT,
    host: parsed.HOST,
    baseUrl: parsed.OPENALEX_BASE_URL,
    requestTimeoutMs: parsed.OPENALEX_REQUEST_TIMEOUT_MS,
    maxRetries: parsed.OPENALEX_MAX_RETRIES,
    corsOrigin: parsed.CORS_ORIGIN,
  };
};
