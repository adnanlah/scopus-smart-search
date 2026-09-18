import { z } from 'zod';

const optionalEnvironmentString = z.preprocess(
  (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
  z.string().trim().min(1).optional(),
);

const environmentSchema = z.object({
  SCOPUS_API_KEY: optionalEnvironmentString,
  SCOPUS_INST_TOKEN: optionalEnvironmentString,
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('127.0.0.1'),
  SCOPUS_BASE_URL: z.string().url().default('https://api.elsevier.com'),
  SCOPUS_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  SCOPUS_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
  SCOPUS_HYDRATION_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(6),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
});

export interface AppConfig {
  apiKey?: string;
  institutionToken?: string;
  port: number;
  host: string;
  baseUrl: string;
  requestTimeoutMs: number;
  maxRetries: number;
  hydrationConcurrency: number;
  corsOrigin: string;
}

export const loadConfig = (environment: NodeJS.ProcessEnv = process.env): AppConfig => {
  const parsed = environmentSchema.parse(environment);
  return {
    apiKey: parsed.SCOPUS_API_KEY,
    institutionToken: parsed.SCOPUS_INST_TOKEN,
    port: parsed.PORT,
    host: parsed.HOST,
    baseUrl: parsed.SCOPUS_BASE_URL,
    requestTimeoutMs: parsed.SCOPUS_REQUEST_TIMEOUT_MS,
    maxRetries: parsed.SCOPUS_MAX_RETRIES,
    hydrationConcurrency: parsed.SCOPUS_HYDRATION_CONCURRENCY,
    corsOrigin: parsed.CORS_ORIGIN,
  };
};