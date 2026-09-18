# Scopus Smart Search

TypeScript monorepo for searching Scopus and hydrating the first 100 results with full abstract metadata.

## Requirements

- Node.js 20 or newer
- pnpm 9 or newer
- An Elsevier Scopus API key

## Getting started

```powershell
pnpm install
Copy-Item apps/api/.env.example apps/api/.env
# Edit apps/api/.env and set SCOPUS_API_KEY
pnpm dev
```

The API environment belongs to `apps/api`. Keep `SCOPUS_API_KEY` server-side and do not expose it through frontend variables such as `VITE_*`.

The API starts on `http://localhost:3000` by default. Start the Vite frontend in a second terminal with:

```powershell
pnpm --filter @scopus/web dev
```

The frontend is available at `http://localhost:5173` and proxies `/api` requests to the API. The API can also be started directly from the workspace root with:

```bash
pnpm --filter @scopus/api dev
```

```bash
curl "http://localhost:3000/health"
curl "http://localhost:3000/api/search?q=machine%20learning&limit=10"
```

The search endpoint caps `limit` at 100. It first performs one Scopus Search API request using `STANDARD` view, then retrieves each available abstract using the Abstract Retrieval API's `FULL` view. Abstract requests are bounded and individual failures are returned on the affected result instead of discarding the entire search.

## Workspace layout

- `apps/api` — Fastify HTTP API and its server-only environment configuration.
- `apps/web` — Vite React research search UI using shadcn-style components and TanStack Query.
- `packages/scopus-client` — typed Scopus API client, XML parsing, normalization, retries, and hydration.
- `packages/shared` — response types shared with the Vite frontend.