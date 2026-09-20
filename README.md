# OpenAlex Smart Search

TypeScript monorepo for searching OpenAlex works and presenting their available scholarly metadata.

## Requirements

- Node.js 20 or newer
- pnpm 9 or newer
- An optional OpenAlex API key for the larger keyed usage budget

## Getting started

```powershell
pnpm install
Copy-Item apps/api/.env.example apps/api/.env
# Set TYPESAFE_API_KEY in apps/api/.env to enable Jev query-constraint inference and optional semantic reranking.
# Optionally edit apps/api/.env and set OPENALEX_API_KEY
pnpm dev
```

The API environment belongs to `apps/api`. When Jev is configured, the search route infers supported OpenAlex constraints from the research query. High-confidence work types, domains, fields, languages, and open-access intent are applied to the OpenAlex `filter` request; the UI shows the applied and rejected interpretations. Set `JEV_CONSTRAINT_THRESHOLD` (default `0.8`) to change the application threshold. Keep `OPENALEX_API_KEY` and `TYPESAFE_API_KEY` server-side and do not expose them through frontend variables such as `VITE_*`. OpenAlex also supports anonymous API requests. When an AI ranking preference is provided through the backward-compatible `filter` parameter, the API retrieves up to 1,000 OpenAlex works across 10 sequential 100-result pages, scores them individually with Jev, and returns every candidate sorted by match probability. Change `JEV_CANDIDATE_PAGE_COUNT` in `apps/api/src/server.ts` to adjust the candidate-page count.

The API starts on `http://localhost:3000` by default. Start the Vite frontend in a second terminal with:

```powershell
pnpm --filter @openalex/web dev
```

The frontend is available at `http://localhost:5173` and proxies `/api` requests to the API. The API can also be started directly from the workspace root with:

```bash
pnpm --filter @openalex/api dev
```

```bash
curl "http://localhost:3000/health"
curl "http://localhost:3000/api/search?q=machine%20learning&limit=10"
curl "http://localhost:3000/api/search?q=machine%20learning&fromYear=2022&limit=10"
curl "http://localhost:3000/api/search?q=machine%20learning&filter=human%20evaluation&fromYear=2022"
```

The search endpoint caps the user-facing `limit` at 100 and requests that number of OpenAlex works through its `/works` endpoint. `fromYear` limits OpenAlex candidates before optional Jev ranking. When `filter` is present, the API extracts and deduplicates its ten highest-scoring English keywords, uses those single words as the OpenAlex query, and reranks up to 1,000 candidates against the original research description. OpenAlex supports a maximum of 100 results per request, so the larger Jev candidate set is assembled from up to ten sequential pages. The keywords are returned in `extractedKeywords`. The first such request downloads the q8 MiniLM model used by Transformers.js; later requests reuse the cached model. If an interrupted download leaves an unreadable cached ONNX file, the API removes only that model artifact and retries the download once. Abstracts are reconstructed from OpenAlex's inverted-index representation when available; works without abstracts remain in the result set.

## Workspace layout

- `apps/api` — Fastify HTTP API and server-only OpenAlex configuration.
- `apps/web` — Vite React literature search UI.
- `packages/openalex-client` — typed OpenAlex client, normalization, retries, abstract reconstruction, and quota parsing.
- `packages/shared` — shared OpenAlex/provider-neutral response types.
