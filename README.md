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
# Optionally edit apps/api/.env and set OPENALEX_API_KEY
pnpm dev
```

The API environment belongs to `apps/api`. Keep `OPENALEX_API_KEY` server-side and do not expose it through frontend variables such as `VITE_*`. OpenAlex also supports anonymous API requests.

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
```

The search endpoint caps `limit` at 100 and requests OpenAlex works through its `/works` endpoint. Abstracts are reconstructed from OpenAlex's inverted-index representation when available; works without abstracts remain in the result set.

## Workspace layout

- `apps/api` — Fastify HTTP API and server-only OpenAlex configuration.
- `apps/web` — Vite React literature search UI.
- `packages/openalex-client` — typed OpenAlex client, normalization, retries, abstract reconstruction, and quota parsing.
- `packages/shared` — shared OpenAlex/provider-neutral response types.
