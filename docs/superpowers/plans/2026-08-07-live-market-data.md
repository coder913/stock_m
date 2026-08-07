# Live Market Data Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace production mock market data with a secure local gateway that normalizes and caches free Alpaca, SEC EDGAR, Finnhub, and FRED data across discovery, research, watchlists, portfolio valuation, news, and events.

**Architecture:** A TypeScript Fastify process owns provider credentials, provider adapters, SQLite caching, stale-data fallback, and the production static frontend. React consumes versioned `/api/*` contracts through one browser client; tests inject deterministic provider fixtures and never depend on live markets.

**Tech Stack:** Node.js 22, TypeScript, Fastify, Zod, better-sqlite3, React, Vite, Vitest, Testing Library, Playwright, stable Chrome.

## Global Constraints

- Approved specification: `docs/superpowers/specs/2026-08-07-live-market-data-design.md`.
- The application is for one local personal user and US-listed stocks and ETFs only.
- The default universe contains approximately 100 high-liquidity stocks and ETFs; do not promise an all-US-market scan.
- Browser code must never receive provider API keys or import provider clients.
- Production UI must not silently mix mock and real data.
- All API times use ISO 8601; UI renders local time while preserving US market-session meaning.
- Missing values remain `undefined`; never convert missing market or financial values to zero.
- SEC financial facts retain original concept, unit, reporting period, form, filing date, and accession number.
- Alpaca IEX data must not be described as consolidated real-time data; expose actual feed and delay.
- Cache writes are transactional and only validated successful responses may replace the last successful value.
- Upstream timeout is 8 seconds; retry network errors, timeouts, and 5xx once, but never retry 4xx or schema failures.
- The gateway listens on `127.0.0.1` by default.
- UI copy is Simplified Chinese and must distinguish delayed, stale, unconfigured, missing, and loading states.
- Keep current local thesis, paper ledger, alerts, and weekly review persistence unchanged.
- Desktop targets remain 1440, 1280, and 1024 px; interactive controls remain keyboard accessible.
- Use TDD and finish every task with its own commit.

## File Map

| Path | Responsibility |
| --- | --- |
| `src/features/market/apiDomain.ts` | Shared normalized data envelopes and market-data domain types |
| `server/config.ts` | Validated environment and runtime configuration |
| `server/app.ts` | Fastify application composition, error mapping, health, and static frontend |
| `server/index.ts` | Real-provider process entry point |
| `server/core/providerTypes.ts` | Provider interfaces and normalized provider result |
| `server/core/errors.ts` | Typed provider and API errors |
| `server/core/marketDataGateway.ts` | Cache-first orchestration, retries, cooldown, and stale fallback |
| `server/cache/sqliteMarketDataCache.ts` | SQLite schema and transactional cache implementation |
| `server/providers/alpacaProvider.ts` | Quotes, bars, status, news, and corporate actions |
| `server/providers/secProvider.ts` | CIK mapping, filings, company facts, and statement normalization |
| `server/providers/finnhubProvider.ts` | Company profiles and earnings calendar |
| `server/providers/fredProvider.ts` | Macro series, releases, and release dates |
| `server/routes/marketRoutes.ts` | Status, quote, and bar endpoints |
| `server/routes/cacheRoutes.ts` | Validated manual-refresh endpoint and resource dispatch |
| `server/routes/companyRoutes.ts` | Profile, financial, filing, and news endpoints |
| `server/routes/eventRoutes.ts` | Unified company and macro events |
| `server/universe/defaultUniverse.ts` | Versioned default stock and ETF universe |
| `server/universe/universeService.ts` | Bounded-concurrency universe hydration and screener snapshot |
| `server/testing/fixtures/*` | Small provider response fixtures |
| `server/testing/e2eServer.ts` | Deterministic API and static server for Playwright |
| `src/features/market/marketApiClient.ts` | Browser-only typed API client |
| `src/features/market/MarketDataState.tsx` | Shared source, delay, time, stale, and error presentation |
| `src/features/market/useMarketRequest.ts` | Reusable request/refresh state hook |
| `src/features/today/TodayPage.tsx` | Real market pulse and event summary |
| `src/features/watchlist/WatchlistPage.tsx` | Batched live watchlist quotes |
| `src/features/discovery/DiscoveryPage.tsx` | Real-universe screening and coverage state |
| `src/features/discovery/universeRepository.ts` | Local user additions and removals from the default universe |
| `src/features/research/ResearchPage.tsx` | Real quote, bars, profile, financials, filings, news, and events |
| `src/features/portfolio/PortfolioPage.tsx` | Real quote-driven paper-portfolio valuation |
| `src/features/discovery/EventCalendar.tsx` | Unified earnings, corporate-action, and macro events |
| `tests/e2e/live-market-data.spec.ts` | Full deterministic browser flow and stale fallback |
| `.env.example` | Provider-key setup without secrets |
| `README.md` | Key acquisition, run commands, caching, limits, and troubleshooting |

---

## Milestone 1: Core Data Foundation

### Task 1: Shared Contracts and Fastify Foundation

**Files:**
- Create: `src/features/market/apiDomain.ts`
- Create: `server/config.ts`
- Create: `server/config.test.ts`
- Create: `server/core/providerTypes.ts`
- Create: `server/core/errors.ts`
- Create: `server/app.ts`
- Create: `server/app.test.ts`
- Create: `server/index.ts`
- Create: `server/testing/fakes.ts`
- Create: `tsconfig.server.json`
- Create: `.env.example`
- Modify: `.gitignore`
- Modify: `package.json`
- Modify: `vite.config.ts`

**Interfaces:**
- Produces `DataEnvelope<T>`, normalized market types, and provider contracts used by all later tasks.
- Produces `loadServerConfig(env): ServerConfig`.
- Produces `buildApp(dependencies): FastifyInstance`.
- Exposes `GET /api/health`.

- [ ] **Step 1: Install gateway dependencies and add scripts**

Run:

```powershell
npm install fastify @fastify/static zod better-sqlite3 dotenv
npm install -D tsx concurrently @types/better-sqlite3
```

Update scripts to include:

```json
{
  "dev": "concurrently -k \"npm:dev:api\" \"npm:dev:web\"",
  "dev:api": "tsx watch server/index.ts",
  "dev:web": "vite",
  "start": "tsx server/index.ts",
  "build": "tsc --noEmit && tsc -p tsconfig.server.json --noEmit && vite build",
  "test:data:smoke": "tsx server/testing/liveSmoke.ts"
}
```

- [ ] **Step 2: Write failing configuration and health tests**

```ts
// server/config.test.ts
// @vitest-environment node
import { expect, test } from "vitest";
import { loadServerConfig } from "./config";

test("never exposes provider secrets through public health configuration", () => {
  const config = loadServerConfig({
    ALPACA_API_KEY_ID: "id",
    ALPACA_API_SECRET_KEY: "secret",
    SEC_USER_AGENT: "stock_m owner@example.com",
  });
  expect(config.providers.alpaca.configured).toBe(true);
  expect(JSON.stringify(config.publicStatus)).not.toContain("secret");
  expect(config.host).toBe("127.0.0.1");
});

test("requires an identifiable SEC user agent", () => {
  expect(() => loadServerConfig({ SEC_USER_AGENT: "stock_m" }))
    .toThrow("SEC_USER_AGENT 必须包含联系邮箱");
});
```

```ts
// server/app.test.ts
// @vitest-environment node
import { expect, test } from "vitest";
import { buildApp } from "./app";
import { createTestDependencies } from "./testing/fakes";

test("reports configuration without returning keys", async () => {
  const app = buildApp(createTestDependencies());
  const response = await app.inject({ method: "GET", url: "/api/health" });
  expect(response.statusCode).toBe(200);
  expect(response.json()).toMatchObject({
    providers: { alpaca: { configured: false } },
    cache: { writable: true },
  });
  expect(response.body).not.toContain("API_KEY");
});
```

- [ ] **Step 3: Run the focused tests and verify failure**

Run:

```powershell
npm test -- server/config.test.ts server/app.test.ts
```

Expected: FAIL because `config.ts`, `app.ts`, and shared contracts do not exist.

- [ ] **Step 4: Implement shared contracts and provider interfaces**

Create exact shared primitives:

```ts
export type ProviderSource = "alpaca" | "sec" | "finnhub" | "fred";
export type DataSource = ProviderSource | "composite";

export interface DataEnvelope<T> {
  data: T;
  source: DataSource;
  asOf: string;
  fetchedAt: string;
  expiresAt: string;
  stale: boolean;
  delayMinutes?: number;
  notices: string[];
}

export interface MarketQuote {
  symbol: string;
  price?: number;
  previousClose?: number;
  change?: number;
  changePercent?: number;
  bid?: number;
  ask?: number;
  volume?: number;
  currency: string;
  marketSession: "pre" | "regular" | "after" | "closed" | "unknown";
}

export interface MarketStatus {
  isOpen: boolean;
  session: "pre" | "regular" | "after" | "closed";
  nextOpen?: string;
  nextClose?: string;
}
```

Add the remaining shared types:

```ts
export interface PriceBar {
  symbol: string;
  startedAt: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  adjusted: boolean;
}

export interface CompanyProfile {
  symbol: string;
  name: string;
  exchange?: string;
  industry?: string;
  sector?: string;
  description?: string;
  website?: string;
  logoUrl?: string;
  marketCapitalization?: number;
  currency?: string;
  cik?: string;
}

export interface FinancialFact {
  symbol: string;
  statement: "income" | "balance-sheet" | "cash-flow";
  concept: string;
  label: string;
  value: number;
  unit: string;
  periodStart?: string;
  periodEnd: string;
  fiscalYear?: number;
  fiscalPeriod?: string;
  form: string;
  filedAt: string;
  accessionNumber: string;
}

export interface SecFiling {
  symbol: string;
  form: "10-K" | "10-K/A" | "10-Q" | "10-Q/A" | "8-K" | "8-K/A";
  filedAt: string;
  reportDate?: string;
  accessionNumber: string;
  primaryDocument: string;
  url: string;
}

export interface MarketEvent {
  id: string;
  type: "earnings" | "dividend" | "split" | "corporate-action" | "macro";
  symbol?: string;
  title: string;
  scheduledAt: string;
  timing: "before-market" | "during-market" | "after-market" | "all-day" | "unknown";
  source: ProviderSource;
  sourceUrl?: string;
}

export interface CompanyNewsItem {
  id: string;
  symbols: string[];
  headline: string;
  summary?: string;
  sourceName: string;
  publishedAt: string;
  url: string;
  imageUrl?: string;
}

export interface MacroObservation {
  seriesId: string;
  label: string;
  value: number;
  unit: string;
  observedAt: string;
}
```

Define the server-only provider result:

```ts
export interface ProviderResult<T> {
  data: T;
  source: ProviderSource;
  asOf: string;
  delayMinutes?: number;
  notices?: string[];
}
```

- [ ] **Step 5: Implement validated configuration, health, and process entry**

`loadServerConfig` must use Zod, default to `127.0.0.1:8787`, store secrets only in private fields, and expose booleans through `publicStatus`. `buildApp` registers JSON error handling and `/api/health`. When passed a `staticDir`, it registers `@fastify/static` and an SPA fallback for non-API GET routes. `server/index.ts` loads `dotenv/config`, opens dependencies, serves `dist` outside Vite development, and listens. `createTestDependencies(overrides?)` supplies an in-memory cache, fixed clock, unconfigured provider status, and allows individual test overrides.

Use this server type-check configuration:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "lib": ["ES2022"],
    "types": ["node", "vitest/globals"],
    "noEmit": true
  },
  "include": ["server", "src/features/market/apiDomain.ts"]
}
```

Configure both Vite development and preview proxy:

```ts
const proxy = { "/api": "http://127.0.0.1:8787" };
export default defineConfig({
  plugins: [react()],
  server: { proxy },
  preview: { proxy },
  test: { /* keep current settings */ },
});
```

Add `.env`, `.data/`, and `*.sqlite*` to `.gitignore`; add documented empty fields to `.env.example`.

- [ ] **Step 6: Verify foundation and commit**

Run:

```powershell
npm test -- server/config.test.ts server/app.test.ts
npm run build
git diff --check
git add package.json package-lock.json tsconfig.server.json vite.config.ts .gitignore .env.example src/features/market/apiDomain.ts server/config.ts server/config.test.ts server/core/providerTypes.ts server/core/errors.ts server/app.ts server/app.test.ts server/index.ts server/testing/fakes.ts
git commit -m "feat: add market data gateway foundation"
```

---

### Task 2: Transactional SQLite Cache and Stale Fallback

**Files:**
- Create: `server/cache/sqliteMarketDataCache.ts`
- Create: `server/cache/sqliteMarketDataCache.test.ts`
- Create: `server/core/marketDataGateway.ts`
- Create: `server/core/marketDataGateway.test.ts`
- Create: `server/core/refreshRegistry.ts`
- Create: `server/routes/cacheRoutes.ts`
- Create: `server/routes/cacheRoutes.test.ts`
- Modify: `server/app.ts`
- Modify: `server/core/providerTypes.ts`

**Interfaces:**
- Produces `MarketDataCache.get<T>(key)`, `put<T>(entry)`, `markCooldown(source, until)`, `getCooldown(source)`, and `health()`.
- Produces `MarketDataGateway.readThrough<T>({ ..., forceRefresh? }): Promise<DataEnvelope<T>>`.
- Produces `RefreshRegistry.register(resource, handler)` and validated `POST /api/cache/refresh`.
- Consumes injected `clock`, `fetcher`, TTL, cache key, and provider source.

- [ ] **Step 1: Write failing cache transaction tests**

```ts
// @vitest-environment node
test("does not replace the last successful value when serialization fails", () => {
  const cache = new SqliteMarketDataCache(":memory:");
  cache.put(record("quotes:NVDA", { price: 100 }, "2026-08-07T10:00:00Z"));
  expect(() => cache.put(record("quotes:NVDA", 1n, "2026-08-07T11:00:00Z")))
    .toThrow();
  expect(cache.get("quotes:NVDA")?.data).toEqual({ price: 100 });
});

test("persists provider cooldown without storing credentials", () => {
  const cache = new SqliteMarketDataCache(":memory:");
  cache.markCooldown("alpaca", "2026-08-07T10:05:00Z");
  expect(cache.getCooldown("alpaca")).toBe("2026-08-07T10:05:00Z");
});
```

- [ ] **Step 2: Write failing gateway fallback tests**

```ts
test("returns a stale last-success value after a provider 429", async () => {
  cache.put(record("quotes:NVDA", [{ symbol: "NVDA", price: 100 }], "2026-08-07T09:00:00Z", "2026-08-07T09:01:00Z"));
  provider.load.mockRejectedValue(new ProviderRateLimitError("alpaca", "2026-08-07T10:05:00Z"));

  const result = await gateway.readThrough({
    key: "quotes:NVDA",
    source: "alpaca",
    ttlMs: 60_000,
    load: provider.load,
  });

  expect(result.stale).toBe(true);
  expect(result.data[0].price).toBe(100);
  expect(result.notices).toContain("数据源限额，正在显示最后成功数据");
});

test("returns PROVIDER_UNAVAILABLE when no cache exists", async () => {
  provider.load.mockRejectedValue(new ProviderTimeoutError("alpaca"));
  await expect(gateway.readThrough(request)).rejects.toMatchObject({
    code: "PROVIDER_UNAVAILABLE",
    retryable: true,
  });
});

test("force refresh bypasses a fresh cache but retains it on failure", async () => {
  cache.put(record("quotes:NVDA", [{ symbol: "NVDA", price: 100 }], "2026-08-07T10:00:00Z", "2026-08-07T10:01:00Z"));
  provider.load.mockRejectedValue(new ProviderTimeoutError("alpaca"));
  const result = await gateway.readThrough({ ...request, forceRefresh: true });
  expect(provider.load).toHaveBeenCalledOnce();
  expect(result).toMatchObject({ stale: false, data: [{ symbol: "NVDA", price: 100 }] });
  expect(result.notices).toContain("刷新失败，继续显示最后成功数据");
});
```

- [ ] **Step 3: Run the focused tests and verify failure**

Run:

```powershell
npm test -- server/cache/sqliteMarketDataCache.test.ts server/core/marketDataGateway.test.ts
```

Expected: FAIL because cache and gateway modules do not exist.

- [ ] **Step 4: Implement schema and transactional writes**

Use these tables:

```sql
CREATE TABLE IF NOT EXISTS market_cache (
  cache_key TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  as_of TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  delay_minutes INTEGER,
  notices_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS provider_state (
  source TEXT PRIMARY KEY,
  cooldown_until TEXT,
  last_success_at TEXT,
  last_error_code TEXT
);
```

Serialize and validate before entering the transaction. Replace one key with one `INSERT ... ON CONFLICT DO UPDATE` transaction. `health()` reports writable status, counts, and oldest timestamps only.

- [ ] **Step 5: Implement cache-first orchestration**

`readThrough` behavior must be exact:

```ts
if (freshEntry && !forceRefresh) return envelope(freshEntry, false);
if (cooldownIsActive) return staleOrThrow("PROVIDER_COOLDOWN");
try {
  const result = await retryOnceForNetworkOr5xx(load, 8_000);
  cache.put(toCacheRecord(result, ttlMs, clock.now()));
  return envelope(cache.get(key)!, false);
} catch (error) {
  if (error instanceof ProviderRateLimitError) {
    cache.markCooldown(source, error.retryAfter);
  }
  return staleOrThrow(mapProviderError(error));
}
```

Never retry authentication, permission, not-found, schema, or validation errors. A failed forced refresh may return a still-fresh prior entry with a refresh-failure notice; `stale` continues to describe TTL age, not the refresh attempt.

`POST /api/cache/refresh` accepts:

```ts
type RefreshRequest =
  | { resource: "quotes"; symbols: string[] }
  | { resource: "bars"; symbol: string; timeframe: "1Min" | "1Day"; start: string; end: string }
  | { resource: "company"; symbol: string }
  | { resource: "financials"; symbol: string }
  | { resource: "filings"; symbol: string }
  | { resource: "news"; symbol: string }
  | { resource: "events"; from: string; to: string; symbols?: string[] }
  | { resource: "macro"; ids: string[] };
```

The registry rejects unregistered resources with 400. Provider tasks register their own handlers, all of which call `readThrough` with `forceRefresh: true`.

- [ ] **Step 6: Verify cache behavior and commit**

Run:

```powershell
npm test -- server/cache/sqliteMarketDataCache.test.ts server/core/marketDataGateway.test.ts server/routes/cacheRoutes.test.ts server/app.test.ts
npm run build
git diff --check
git add server/cache server/core server/routes/cacheRoutes.ts server/routes/cacheRoutes.test.ts server/app.ts
git commit -m "feat: add resilient market data cache"
```

---

### Task 3: Alpaca Quotes, Bars, and Market Status

**Files:**
- Create: `server/providers/alpacaProvider.ts`
- Create: `server/providers/alpacaProvider.test.ts`
- Create: `server/testing/fixtures/alpaca-snapshots.json`
- Create: `server/testing/fixtures/alpaca-snapshots-missing-trade.json`
- Create: `server/testing/fixtures/alpaca-bars.json`
- Create: `server/testing/fixtures/alpaca-clock.json`
- Create: `server/routes/marketRoutes.ts`
- Create: `server/routes/marketRoutes.test.ts`
- Modify: `server/app.ts`
- Modify: `server/core/providerTypes.ts`

**Interfaces:**
- Produces `AlpacaProvider.getMarketStatus()`, `getQuotes(symbols)`, and `getBars(symbol, query)`.
- Exposes `/api/market/status`, `/api/market/quotes`, and `/api/market/bars/:symbol`.
- Registers `quotes` and `bars` manual-refresh handlers.
- Uses 60-second quote/minute-bar TTL and 15-minute daily-bar TTL.

- [ ] **Step 1: Save minimal Alpaca fixtures and write failing adapter tests**

```ts
test("normalizes delayed SIP snapshots without claiming realtime", async () => {
  const provider = new AlpacaProvider(config, fixtureFetch("alpaca-snapshots.json"));
  const result = await provider.getQuotes(["nvda", "AAPL"], "delayed_sip");

  expect(result.source).toBe("alpaca");
  expect(result.delayMinutes).toBe(15);
  expect(result.data[0]).toMatchObject({
    symbol: "NVDA",
    currency: "USD",
    marketSession: "regular",
  });
});

test("keeps a missing quote price undefined", async () => {
  const provider = new AlpacaProvider(config, fixtureFetch("alpaca-snapshots-missing-trade.json"));
  expect((await provider.getQuotes(["XOM"], "iex")).data[0].price).toBeUndefined();
});
```

- [ ] **Step 2: Write failing route validation tests**

```ts
test("rejects more than 100 symbols without truncating", async () => {
  const symbols = Array.from({ length: 101 }, (_, index) => `S${index}`).join(",");
  const response = await app.inject({ url: `/api/market/quotes?symbols=${symbols}` });
  expect(response.statusCode).toBe(400);
  expect(response.json().code).toBe("TOO_MANY_SYMBOLS");
});

test("uppercases and deduplicates symbols", async () => {
  await app.inject({ url: "/api/market/quotes?symbols=nvda,NVDA,aapl" });
  expect(provider.getQuotes).toHaveBeenCalledWith(["NVDA", "AAPL"], "delayed_sip");
});

test("manually refreshes quotes through the refresh endpoint", async () => {
  const response = await app.inject({
    method: "POST",
    url: "/api/cache/refresh",
    payload: { resource: "quotes", symbols: ["nvda"] },
  });
  expect(response.statusCode).toBe(200);
  expect(provider.getQuotes).toHaveBeenCalledWith(["NVDA"], "delayed_sip");
});
```

- [ ] **Step 3: Run tests and verify failure**

Run:

```powershell
npm test -- server/providers/alpacaProvider.test.ts server/routes/marketRoutes.test.ts
```

Expected: FAIL because the Alpaca adapter and market routes do not exist.

- [ ] **Step 4: Implement Alpaca boundary parsing**

Use Zod schemas at the response boundary. Map latest trade, daily bar, previous daily bar, latest quote, and feed metadata into `MarketQuote`. Derive change only when both price and previous close exist. Preserve `undefined` otherwise.

Map HTTP responses:

```ts
401 -> ProviderAuthError
403 -> ProviderPermissionError
404 -> ProviderNotFoundError
429 -> ProviderRateLimitError
500..599 -> ProviderServerError
invalid JSON or schema -> ProviderSchemaError
```

- [ ] **Step 5: Implement cached market routes**

Validate symbol syntax with `/^[A-Z0-9.-]+$/`, deduplicate while preserving order, and cap batches at 100. Use cache keys containing feed, timeframe, date range, and sorted symbols. Return the exact `DataEnvelope<T>` contract.

- [ ] **Step 6: Verify real-market routes and commit**

Run:

```powershell
npm test -- server/providers/alpacaProvider.test.ts server/routes/marketRoutes.test.ts server/core/marketDataGateway.test.ts
npm run build
git diff --check
git add server/providers/alpacaProvider.ts server/providers/alpacaProvider.test.ts server/testing/fixtures/alpaca-*.json server/routes/marketRoutes.ts server/routes/marketRoutes.test.ts server/app.ts server/core/providerTypes.ts
git commit -m "feat: add alpaca market data adapter"
```

---

### Task 4: SEC Filings and Financial Facts

**Files:**
- Create: `server/providers/secProvider.ts`
- Create: `server/providers/secProvider.test.ts`
- Create: `server/providers/secConceptMap.ts`
- Create: `server/testing/fixtures/sec-company-tickers.json`
- Create: `server/testing/fixtures/sec-nvda-submissions.json`
- Create: `server/testing/fixtures/sec-nvda-companyfacts.json`
- Create: `server/routes/companyRoutes.ts`
- Create: `server/routes/companyRoutes.test.ts`
- Modify: `server/app.ts`
- Modify: `server/core/providerTypes.ts`

**Interfaces:**
- Produces `SecProvider.resolveCik(symbol)`, `getFilings(symbol)`, and `getFinancialFacts(symbol)`.
- Produces normalized income, balance-sheet, and cash-flow facts without cross-unit arithmetic.
- Exposes `/api/companies/:symbol/financials` and `/api/companies/:symbol/filings`.

- [ ] **Step 1: Write failing SEC normalization tests**

```ts
test("retains SEC provenance for normalized revenue facts", async () => {
  const result = await provider.getFinancialFacts("NVDA");
  expect(result.data.find((fact) => fact.concept === "RevenueFromContractWithCustomerExcludingAssessedTax"))
    .toMatchObject({
      statement: "income",
      unit: "USD",
      form: "10-K",
      accessionNumber: "0001045810-26-000042",
    });
});

test("does not combine values with different units", async () => {
  const result = await provider.getFinancialFacts("NVDA");
  const revenue = result.data.filter((fact) => fact.label === "营业收入");
  expect(new Set(revenue.map((fact) => fact.unit)).size).toBe(1);
});

test("requires an identifiable User-Agent on every SEC request", async () => {
  await provider.getFilings("NVDA");
  expect(fetchSpy).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
    headers: expect.objectContaining({ "User-Agent": "stock_m owner@example.com" }),
  }));
});
```

- [ ] **Step 2: Write failing company route tests**

```ts
test("returns only supported filing forms in newest-first order", async () => {
  const response = await app.inject({ url: "/api/companies/NVDA/filings" });
  expect(response.statusCode).toBe(200);
  expect(response.json().data.map((item: { form: string }) => item.form))
    .toEqual(["8-K", "10-Q", "10-K"]);
});
```

- [ ] **Step 3: Run tests and verify failure**

Run:

```powershell
npm test -- server/providers/secProvider.test.ts server/routes/companyRoutes.test.ts
```

Expected: FAIL because SEC modules and routes do not exist.

- [ ] **Step 4: Implement CIK, submissions, and fact parsing**

Normalize ticker lookup to a zero-padded 10-digit CIK. Build filing URLs from CIK and accession number. Include only `10-K`, `10-K/A`, `10-Q`, `10-Q/A`, `8-K`, and `8-K/A`. Register `financials` and `filings` manual-refresh handlers.

Define an explicit concept map:

```ts
export const secConceptMap = {
  Revenues: { statement: "income", label: "营业收入" },
  RevenueFromContractWithCustomerExcludingAssessedTax: { statement: "income", label: "营业收入" },
  NetIncomeLoss: { statement: "income", label: "净利润" },
  Assets: { statement: "balance-sheet", label: "总资产" },
  Liabilities: { statement: "balance-sheet", label: "总负债" },
  NetCashProvidedByUsedInOperatingActivities: { statement: "cash-flow", label: "经营现金流" },
  PaymentsToAcquirePropertyPlantAndEquipment: { statement: "cash-flow", label: "资本开支" },
} as const;
```

When multiple concepts map to one label, select one concept per issuer and period using a documented priority order; never sum them.

- [ ] **Step 5: Register cached routes**

Use 24-hour TTL for ticker mapping and filing lists. Financial facts remain cached until the newest submissions accession number changes; include that accession number in the cache version key.

- [ ] **Step 6: Verify SEC behavior and commit**

Run:

```powershell
npm test -- server/providers/secProvider.test.ts server/routes/companyRoutes.test.ts
npm run build
git diff --check
git add server/providers/secProvider.ts server/providers/secProvider.test.ts server/providers/secConceptMap.ts server/testing/fixtures/sec-*.json server/routes/companyRoutes.ts server/routes/companyRoutes.test.ts server/app.ts server/core/providerTypes.ts
git commit -m "feat: add sec filings and fundamentals"
```

---

### Task 5: Finnhub Profiles, Earnings, and the Default Universe

**Files:**
- Create: `server/providers/finnhubProvider.ts`
- Create: `server/providers/finnhubProvider.test.ts`
- Create: `server/testing/fixtures/finnhub-nvda-profile.json`
- Create: `server/testing/fixtures/finnhub-earnings-calendar.json`
- Create: `server/universe/defaultUniverse.ts`
- Create: `server/universe/metricCalculator.ts`
- Create: `server/universe/metricCalculator.test.ts`
- Create: `server/universe/universeService.ts`
- Create: `server/universe/universeService.test.ts`
- Create: `server/routes/discoveryRoutes.ts`
- Create: `server/routes/discoveryRoutes.test.ts`
- Create: `server/routes/eventRoutes.ts`
- Create: `server/routes/eventRoutes.test.ts`
- Modify: `server/routes/companyRoutes.ts`
- Modify: `server/app.ts`
- Modify: `src/features/market/apiDomain.ts`

**Interfaces:**
- Produces `FinnhubProvider.getCompanyProfile(symbol)` and `getEarnings(from, to, symbols?)`.
- Produces `calculateScreenerMetrics(input): Partial<StockMetrics>` with explicit formulas.
- Produces `UniverseService.getSnapshot(symbols): DiscoveryUniverseSnapshot`.
- Exposes `/api/companies/:symbol`, `/api/discovery/universe`, `/api/discovery/themes`, and earnings through `/api/events`.

- [ ] **Step 1: Write failing Finnhub tests**

```ts
test("normalizes a company profile and keeps optional values missing", async () => {
  const result = await provider.getCompanyProfile("NVDA");
  expect(result.data).toMatchObject({
    symbol: "NVDA",
    name: "NVIDIA Corp",
    exchange: "NASDAQ NMS - GLOBAL MARKET",
  });
  expect(result.data.description).toBeUndefined();
});

test("maps earnings timing without inventing an exact clock time", async () => {
  const result = await provider.getEarnings("2026-08-01", "2026-08-31", ["NVDA"]);
  expect(result.data[0]).toMatchObject({
    type: "earnings",
    timing: "after-market",
  });
});
```

- [ ] **Step 2: Write failing universe hydration tests**

```ts
test("returns quotes first and marks metrics still being prepared", async () => {
  fundamentals.getMetrics.mockResolvedValueOnce(undefined);
  const result = await service.getSnapshot(["NVDA"]);
  expect(result.items[0]).toMatchObject({
    symbol: "NVDA",
    metrics: { price: 167.32 },
    coverage: { status: "preparing" },
  });
});

test("uses at most four concurrent profile or fundamentals loads", async () => {
  await service.getSnapshot(defaultUniverse.slice(0, 20));
  expect(concurrencyProbe.maximum).toBeLessThanOrEqual(4);
});
```

- [ ] **Step 3: Write failing screener-metric formula tests**

```ts
test("calculates only metrics supported by free-source inputs", () => {
  const metrics = calculateScreenerMetrics({
    quote: { price: 120, previousClose: 100, volume: 300 },
    dailyBars: dailyBars({ latestClose: 120, high20: 125, averageVolume20: 200 }),
    financials: financialFacts({
      revenueTtm: 1200,
      revenuePriorTtm: 1000,
      operatingIncomeTtm: 240,
      operatingCashFlowTtm: 300,
      capitalExpenditureTtm: 80,
      marketCapUsdMillions: 10_000,
    }),
  });

  expect(metrics).toMatchObject({
    price: 120,
    dailyChangePercent: 20,
    revenueGrowthYoY: 20,
    operatingMargin: 20,
    freeCashFlow: 220,
    freeCashFlowYield: 2.2,
    priceVs20DayHigh: -4,
    relativeVolume: 1.5,
  });
  expect(metrics.forwardPE).toBeUndefined();
  expect(metrics.peg).toBeUndefined();
  expect(metrics.nextFyEpsRevision30d).toBeUndefined();
});
```

- [ ] **Step 4: Run tests and verify failure**

Run:

```powershell
npm test -- server/providers/finnhubProvider.test.ts server/universe/metricCalculator.test.ts server/universe/universeService.test.ts server/routes/discoveryRoutes.test.ts server/routes/eventRoutes.test.ts
```

Expected: FAIL because Finnhub and universe modules do not exist.

- [ ] **Step 5: Implement profiles and earnings**

Use Zod response schemas and map Finnhub error payloads before normalization. Cache profiles for 24 hours and earnings calendars for 6 hours. Merge SEC CIK and regulatory metadata into the company route; Finnhub remains authoritative only for display fields such as website, logo, and description. Register `company` manual refresh and add earnings refresh to the `events` handler.

- [ ] **Step 6: Implement the supported screener formulas**

Use these formulas and return `undefined` when an input is missing or a denominator is zero:

```ts
dailyChangePercent = (price / previousClose - 1) * 100;
revenueGrowthYoY = (revenueTtm / revenuePriorTtm - 1) * 100;
epsGrowthYoY = (dilutedEpsTtm / dilutedEpsPriorTtm - 1) * 100;
grossMargin = ((revenueTtm - costOfRevenueTtm) / revenueTtm) * 100;
freeCashFlow = operatingCashFlowTtm - capitalExpenditureTtm;
freeCashFlowYield = (freeCashFlow / marketCapUsdMillions) * 100;
netDebtToEbitda = (totalDebt - cashAndEquivalents) / ebitdaTtm;
earningsSurprise = ((epsActual - epsEstimate) / Math.abs(epsEstimate)) * 100;
grossMarginYoYChange = grossMarginTtm - grossMarginPriorTtm;
priceVs20DayHigh = (price / high20 - 1) * 100;
relativeVolume = currentVolume / averageVolume20;
averageDollarVolume20d = average(close * volume) / 1_000_000;
operatingMargin = (operatingIncomeTtm / revenueTtm) * 100;
return3Months = (latestClose / close63SessionsAgo - 1) * 100;
beta = covariance(stockDailyReturns, spyDailyReturns) / variance(spyDailyReturns);
```

Use a second universe pass for `grossMarginVsIndustryMedian`. Leave `forwardPE`, `forwardPEToIndustryMedian`, `peg`, and `nextFyEpsRevision30d` undefined because the approved free sources do not reliably provide forward analyst estimates.

Add shared `UniverseStockSnapshot`, `DiscoveryUniverseSnapshot`, `UniverseCoverage`, and `MarketTheme` types to `apiDomain.ts`.

- [ ] **Step 7: Implement the versioned 100-symbol universe**

Define a static array with `{ symbol, kind }` using this exact 100-symbol first version:

```ts
export const defaultUniverseSymbols = [
  "SPY", "QQQ", "DIA", "IWM", "XLK", "XLF", "XLV", "XLY", "XLP", "XLE",
  "XLI", "XLU", "XLB", "XLRE", "SOXX",
  "AAPL", "MSFT", "NVDA", "AVGO", "ORCL", "CRM", "ADBE", "CSCO", "IBM", "NOW",
  "INTU", "ACN", "AMD", "QCOM", "TXN", "AMAT", "MU", "LRCX", "KLAC", "INTC",
  "PANW", "CRWD", "PLTR", "SNOW",
  "GOOGL", "META", "NFLX", "DIS", "TMUS", "VZ", "T", "CHTR",
  "AMZN", "TSLA", "HD", "MCD", "BKNG", "NKE", "SBUX", "LOW", "TJX", "CMG",
  "ABNB", "RCL",
  "WMT", "COST", "PG", "KO", "PEP", "PM", "MO", "MDLZ",
  "BRK.B", "JPM", "BAC", "WFC", "GS", "MS", "C", "V", "MA", "AXP",
  "LLY", "UNH", "JNJ", "ABBV", "MRK", "TMO", "ABT", "ISRG", "AMGN", "GILD",
  "GE", "CAT", "RTX", "HON", "UPS", "BA", "DE",
  "XOM", "CVX", "NEE", "LIN", "PLD", "DUK",
] as const;
```

Derive `kind` from the first 15 ETF symbols and assert:

```ts
expect(defaultUniverse.length).toBeGreaterThanOrEqual(95);
expect(defaultUniverse.length).toBeLessThanOrEqual(105);
expect(new Set(defaultUniverse.map((item) => item.symbol)).size)
  .toBe(defaultUniverse.length);
```

`UniverseService` batch-loads quotes first, reads cached profile/fundamental metrics next, and hydrates missing data with concurrency `4`. Missing metrics remain absent and produce coverage metadata.

- [ ] **Step 8: Derive real themes from universe data**

Group ready stocks by real profile sector. Produce market-cap-weighted change and available-metric coverage. Produce ETF-backed themes for semiconductors (`SOXX`), technology (`XLK`), financials (`XLF`), healthcare (`XLV`), consumer discretionary (`XLY`), staples (`XLP`), energy (`XLE`), industrials (`XLI`), utilities (`XLU`), materials (`XLB`), and real estate (`XLRE`). Do not calculate `valuationDeviation` when forward valuation is unavailable.

- [ ] **Step 9: Verify company and discovery routes, then commit**

Run:

```powershell
npm test -- server/providers/finnhubProvider.test.ts server/universe/metricCalculator.test.ts server/universe/universeService.test.ts server/routes/discoveryRoutes.test.ts server/routes/companyRoutes.test.ts server/routes/eventRoutes.test.ts
npm run build
git diff --check
git add server/providers/finnhubProvider.ts server/providers/finnhubProvider.test.ts server/testing/fixtures/finnhub-*.json server/universe server/routes/discoveryRoutes.ts server/routes/discoveryRoutes.test.ts server/routes/eventRoutes.ts server/routes/eventRoutes.test.ts server/routes/companyRoutes.ts server/app.ts src/features/market/apiDomain.ts
git commit -m "feat: add company profiles and live universe"
```

---

### Task 6: Browser API Client and Shared Data States

**Files:**
- Create: `src/features/market/marketApiClient.ts`
- Create: `src/features/market/marketApiClient.test.ts`
- Create: `src/features/market/useMarketRequest.ts`
- Create: `src/features/market/useMarketRequest.test.tsx`
- Create: `src/features/market/MarketDataState.tsx`
- Create: `src/features/market/MarketDataState.test.tsx`
- Create: `src/features/market/marketDataState.css`
- Modify: `src/features/market/marketRepository.ts`
- Modify: `src/features/market/domain.ts`

**Interfaces:**
- Produces `MarketApiClient.getMarketStatus()`, `getQuotes(symbols)`, `getQuote(symbol)`, `getBars(symbol, query)`, `getCompany(symbol)`, `getFinancials(symbol)`, `getFilings(symbol)`, `getNews(symbol)`, `getUniverse(symbols)`, `getEvents(query)`, `getMacroSeries(ids)`, and `refresh(request)`.
- Produces `useMarketRequest({ load, refresh? })` with `loading`, `refreshing`, `data`, `error`, and `refresh()`.
- Produces `<MarketDataState envelope error onRetry />`.
- Keeps mock repositories available only as explicitly injected test fixtures.

- [ ] **Step 1: Write failing API error and envelope tests**

```ts
test("parses a stale envelope without discarding its data", async () => {
  fetchMock.mockResolvedValue(response({
    data: [{ symbol: "NVDA", price: 167.32 }],
    source: "alpaca",
    asOf: "2026-08-07T14:00:00Z",
    fetchedAt: "2026-08-07T14:00:10Z",
    expiresAt: "2026-08-07T14:01:10Z",
    stale: true,
    delayMinutes: 15,
    notices: ["数据源限额，正在显示最后成功数据"],
  }));
  expect((await client.getQuotes(["NVDA"])).stale).toBe(true);
});

test("throws a typed retryable API error", async () => {
  fetchMock.mockResolvedValue(response(
    { code: "PROVIDER_UNAVAILABLE", message: "暂时无法获取行情", retryable: true },
    503,
  ));
  await expect(client.getQuotes(["NVDA"])).rejects.toMatchObject({
    code: "PROVIDER_UNAVAILABLE",
    retryable: true,
  });
});
```

- [ ] **Step 2: Write failing hook and status presentation tests**

```tsx
test("keeps current data visible while manually refreshing", async () => {
  const { result } = renderHook(() => useMarketRequest({ load, refresh }));
  await waitFor(() => expect(result.current.data).toBeDefined());
  act(() => void result.current.refresh());
  expect(refresh).toHaveBeenCalledOnce();
  expect(result.current.refreshing).toBe(true);
  expect(result.current.data).toEqual(firstEnvelope);
});

test("labels stale delayed data with its timestamp", () => {
  render(<MarketDataState envelope={staleEnvelope} error={null} onRetry={() => undefined} />);
  expect(screen.getByText("旧缓存")).toBeVisible();
  expect(screen.getByText("延迟 15 分钟")).toBeVisible();
  expect(screen.getByText(/数据时间/)).toBeVisible();
});
```

- [ ] **Step 3: Run tests and verify failure**

Run:

```powershell
npm test -- src/features/market/marketApiClient.test.ts src/features/market/useMarketRequest.test.tsx src/features/market/MarketDataState.test.tsx
```

Expected: FAIL because the browser client, hook, and status component do not exist.

- [ ] **Step 4: Implement the browser boundary**

`MarketApiClient` accepts an injected `fetch` and base URL, validates response shape, encodes symbols, and never knows provider credentials. `refresh(request)` posts only the typed refresh request to `/api/cache/refresh`. `useMarketRequest` aborts stale requests on dependency change and preserves prior data during manual refresh; its `refresh()` first invokes the matching client refresh and then reloads the envelope.

`MarketDataState` must render these distinct Chinese labels:

- `延迟 15 分钟`
- `旧缓存`
- `数据源未配置`
- `暂无数据`
- `正在加载`

Do not use color as the only distinction.

- [ ] **Step 5: Verify shared browser behavior and commit**

Run:

```powershell
npm test -- src/features/market
npm run build
git diff --check
git add src/features/market
git commit -m "feat: add typed market data browser client"
```

---

### Task 7: Today, Watchlist, and Portfolio Live Quotes

**Files:**
- Modify: `src/features/today/TodayPage.tsx`
- Modify: `src/features/today/TodayPage.test.tsx`
- Modify: `src/features/today/today.css`
- Modify: `src/features/watchlist/WatchlistPage.tsx`
- Modify: `src/features/watchlist/WatchlistPage.test.tsx`
- Modify: `src/features/watchlist/watchlist.css`
- Modify: `src/features/portfolio/PortfolioPage.tsx`
- Modify: `src/features/portfolio/PortfolioPage.test.tsx`
- Modify: `src/features/portfolio/portfolio.css`
- Modify: `src/features/portfolio/domain.ts`

**Interfaces:**
- Consumes batched `MarketApiClient.getQuotes`.
- Today loads `SPY`, `QQQ`, `DIA`, and `IWM`.
- Watchlist batches the union of all active-group symbols.
- Portfolio converts quote envelopes into the existing `calculatePortfolio` input and records quote provenance in snapshots.

- [ ] **Step 1: Replace test fixtures with injected clients and write failing tests**

```tsx
test("today shows quote source, delay, and manual refresh", async () => {
  render(<MemoryRouter><TodayPage marketClient={client} /></MemoryRouter>);
  expect(await screen.findByText("SPY")).toBeVisible();
  expect(screen.getByText("延迟 15 分钟")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "刷新市场数据" }));
  expect(client.refresh).toHaveBeenCalledWith({ resource: "quotes", symbols: ["SPY", "QQQ", "DIA", "IWM"] });
  expect(client.getQuotes).toHaveBeenCalledTimes(2);
});

test("watchlist sends one deduplicated batch", async () => {
  seedGroups(["NVDA", "AAPL"], ["NVDA", "MSFT"]);
  render(<WatchlistPage marketClient={client} />);
  await waitFor(() => expect(client.getQuotes)
    .toHaveBeenCalledWith(["NVDA", "AAPL", "MSFT"]));
});

test("portfolio keeps total value unavailable when one live quote is missing", async () => {
  seedBuys(["NVDA", "XOM"]);
  client.getQuotes.mockResolvedValue(envelope([
    quote("NVDA", 167.32),
    quote("XOM", undefined),
  ]));
  render(<PortfolioPage marketClient={client} />);
  expect(await screen.findByText("估值不可用")).toBeVisible();
});
```

- [ ] **Step 2: Run page tests and verify failure**

Run:

```powershell
npm test -- src/features/today/TodayPage.test.tsx src/features/watchlist/WatchlistPage.test.tsx src/features/portfolio/PortfolioPage.test.tsx
```

Expected: FAIL because the pages still read mock or constant quote data.

- [ ] **Step 3: Implement Today and Watchlist quote loading**

Keep local watchlist group operations unchanged. Add quote rows and shared status metadata. An empty watchlist must not issue an API request. A failed refresh must keep the last envelope visible.

- [ ] **Step 4: Implement portfolio quote valuation**

Remove the module-level hard-coded `quotes`. Fetch only symbols present in the immutable ledger. Convert:

```ts
const analyticsQuotes = Object.fromEntries(
  envelope.data
    .filter((quote) => quote.price !== undefined)
    .map((quote) => [quote.symbol, {
      price: quote.price!,
      previousClose: quote.previousClose,
    }]),
);
```

Add `quoteSource`, `quoteAsOf`, and `quoteStale` to submitted snapshot metadata without mutating prior snapshots.

- [ ] **Step 5: Verify core quote integration and commit**

Run:

```powershell
npm test -- src/features/today/TodayPage.test.tsx src/features/watchlist/WatchlistPage.test.tsx src/features/portfolio/PortfolioPage.test.tsx src/features/portfolio/portfolioAnalytics.test.ts
npm run build
git diff --check
git add src/features/today src/features/watchlist src/features/portfolio
git commit -m "feat: use live quotes across core pages"
```

---

### Task 8: Real Universe Discovery and User Universe

**Files:**
- Create: `src/features/discovery/universeRepository.ts`
- Create: `src/features/discovery/universeRepository.test.ts`
- Modify: `src/features/discovery/domain.ts`
- Modify: `src/features/discovery/discoveryRepository.ts`
- Modify: `src/features/discovery/DiscoveryPage.tsx`
- Modify: `src/features/discovery/DiscoveryPage.test.tsx`
- Modify: `src/features/discovery/ScreenerResults.tsx`
- Modify: `src/features/discovery/ScreenerPanel.tsx`
- Modify: `src/features/discovery/templates.ts`
- Modify: `src/features/discovery/ThemeView.tsx`
- Modify: `src/features/discovery/discovery.css`

**Interfaces:**
- Produces `UniverseRepository.list(defaultSymbols)`, `add(symbol)`, `remove(symbol)`, and `restore(symbol)`.
- Uses storage key `stock_m:user-universe:v1`.
- Consumes `/api/discovery/universe?symbols=...`.
- Preserves existing pure `runScreen` and saved-screen behavior.
- Replaces default templates with conditions supported by the approved free data sources.

- [ ] **Step 1: Write failing user-universe tests**

```ts
test("adds a valid symbol once and persists removals from defaults", () => {
  const repository = new UniverseRepository(localStorage);
  repository.add("xom");
  repository.add("XOM");
  repository.remove("AAPL");
  expect(repository.list(["AAPL", "MSFT"])).toEqual(["MSFT", "XOM"]);
});

test("rejects invalid symbols before persistence", () => {
  const repository = new UniverseRepository(localStorage);
  expect(() => repository.add("NVDA<script>")).toThrow("股票代码格式无效");
  expect(localStorage.getItem("stock_m:user-universe:v1")).toBeNull();
});
```

- [ ] **Step 2: Write failing discovery coverage tests**

```tsx
test("does not treat preparing metrics as a failed screen", async () => {
  client.getUniverse.mockResolvedValue(universeEnvelope([
    stock("NVDA", { revenueGrowthYoY: 35 }, "ready"),
    stock("XOM", {}, "preparing"),
  ]));
  render(<DiscoveryPage marketClient={client} />);
  expect(await screen.findByText("1 个标的数据准备中")).toBeVisible();
  expect(screen.getByText(/数据覆盖率/)).toHaveTextContent("50%");
});

test("validates a symbol with the gateway before adding it", async () => {
  render(<DiscoveryPage marketClient={client} />);
  await user.type(screen.getByLabelText("添加股票代码"), "ZZZZ");
  await user.click(screen.getByRole("button", { name: "加入股票池" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("未找到股票 ZZZZ");
});
```

- [ ] **Step 3: Run discovery tests and verify failure**

Run:

```powershell
npm test -- src/features/discovery/universeRepository.test.ts src/features/discovery/DiscoveryPage.test.tsx src/features/discovery/screener.test.ts
```

Expected: FAIL because discovery still uses `mockDiscoveryRepository`.

- [ ] **Step 4: Implement user universe and live repository**

Store only `addedSymbols` and `removedDefaultSymbols`; derive the final list against the versioned defaults. Validate a new symbol using `/api/companies/:symbol` before writing.

Extend `StockSnapshot` with:

```ts
coverage: {
  status: "ready" | "partial" | "preparing";
  availableMetrics: number;
  totalMetrics: number;
};
```

- [ ] **Step 5: Integrate real screening without changing missing-value semantics**

Remove production use of `mockDiscoveryRepository`. Render ready results, a preparation count, and overall metric coverage. Keep `runScreen` pure: a missing required metric does not match, but preparing rows are separately counted and explained.

- [ ] **Step 6: Replace unsupported default templates**

Use these exact real-data templates:

```ts
[
  {
    id: "quality-growth",
    name: "高质量成长",
    conditions: [
      condition("revenueGrowthYoY", ">=", 10, "TTM"),
      condition("operatingMargin", ">=", 15, "TTM"),
      condition("freeCashFlow", ">", 0, "TTM"),
    ],
  },
  {
    id: "cashflow-value",
    name: "现金流价值",
    conditions: [
      condition("freeCashFlowYield", ">=", 2, "TTM"),
      condition("netDebtToEbitda", "<=", 3, "TTM"),
    ],
  },
  {
    id: "earnings-improvement",
    name: "财报改善",
    conditions: [
      condition("revenueGrowthYoY", ">", 0, "TTM"),
      condition("grossMarginYoYChange", ">", 0, "TTM"),
      condition("earningsSurprise", ">=", 0, "MRQ"),
    ],
  },
  {
    id: "volume-breakout",
    name: "放量突破",
    conditions: [
      condition("priceVs20DayHigh", ">=", -3, "CURRENT"),
      condition("relativeVolume", ">=", 1.5, "CURRENT"),
      condition("averageDollarVolume20d", ">=", 50, "CURRENT"),
    ],
  },
]
```

Keep unsupported metrics in saved-screen deserialization for backward compatibility, but label them `当前免费数据源不支持` and exclude them from the “新增条件” menu. Render real derived themes rather than mock themes.

- [ ] **Step 7: Verify discovery and commit**

Run:

```powershell
npm test -- src/features/discovery
npm run build
git diff --check
git add src/features/discovery
git commit -m "feat: add real-data discovery universe"
```

---

### Task 9: Research Page Core Real Data

**Files:**
- Create: `src/features/research/PriceHistory.tsx`
- Create: `src/features/research/FinancialTrends.tsx`
- Create: `src/features/research/FilingsList.tsx`
- Create: `src/features/research/ResearchDataSection.tsx`
- Modify: `src/features/research/ResearchPage.tsx`
- Modify: `src/features/research/ResearchPage.test.tsx`
- Modify: `src/features/research/ResearchFlow.test.tsx`
- Create: `src/features/research/research.css`
- Modify: `src/features/research/PeerComparison.tsx`

**Interfaces:**
- Consumes quote, bars, company profile, financial facts, filings, and peers from `MarketApiClient`.
- Each section loads and fails independently.
- Existing thesis-first simulated-buy guard remains unchanged.

- [ ] **Step 1: Write failing independent-section tests**

```tsx
test("shows quote and filings even when financial facts fail", async () => {
  client.getQuote.mockResolvedValue(quoteEnvelope("NVDA", 167.32));
  client.getCompany.mockResolvedValue(profileEnvelope("NVDA"));
  client.getBars.mockResolvedValue(barsEnvelope("NVDA"));
  client.getFilings.mockResolvedValue(filingsEnvelope("NVDA"));
  client.getFinancials.mockRejectedValue(apiError("PROVIDER_UNAVAILABLE"));

  render(<MemoryRouter initialEntries={["/stocks/NVDA"]}>
    <Routes><Route path="/stocks/:symbol" element={<ResearchPage marketClient={client} />} /></Routes>
  </MemoryRouter>);

  expect(await screen.findByText("167.32 USD")).toBeVisible();
  expect(screen.getByRole("link", { name: /查看 10-K 原文/ })).toBeVisible();
  expect(screen.getByText("财务数据暂时不可用")).toBeVisible();
});

test("does not enable paper buy before a thesis version exists", async () => {
  renderResearch();
  expect(await screen.findByRole("button", { name: "确认模拟买入" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "保存投资逻辑" }));
  expect(screen.getByRole("button", { name: "确认模拟买入" })).toBeEnabled();
});
```

- [ ] **Step 2: Run research tests and verify failure**

Run:

```powershell
npm test -- src/features/research/ResearchPage.test.tsx src/features/research/ResearchFlow.test.tsx
```

Expected: FAIL because `ResearchPage` still loads one mock aggregate.

- [ ] **Step 3: Split research into bounded sections**

`ResearchPage` owns symbol, profile heading, thesis, and simulated-buy orchestration. `PriceHistory`, `FinancialTrends`, and `FilingsList` own only presentation. `ResearchDataSection` renders loading/error/retry/status consistently for one envelope.

Financial trends group facts by `label + unit`, sort by `periodEnd`, and never combine different units. Filing links open SEC in a new tab with accessible external-link text.

- [ ] **Step 4: Connect real data and preserve thesis behavior**

Load sections in parallel through independent hooks. Use the current live quote as the default simulated-buy price only when it exists. If price is missing, disable buy and show `当前报价不可用`.

Update peer comparison to request the live discovery snapshot for the current industry and preserve missing metrics.

- [ ] **Step 5: Verify milestone-one UI and commit**

Run:

```powershell
npm test -- src/features/research src/features/thesis src/features/portfolio/localPortfolioRepository.test.ts
npm run build
git diff --check
git add src/features/research
git commit -m "feat: connect research to real company data"
```

---

## Milestone 2: News, Corporate Actions, and Macro Events

### Task 10: Alpaca News and Actions, FRED Macro Data, Unified Events

**Files:**
- Modify: `server/providers/alpacaProvider.ts`
- Modify: `server/providers/alpacaProvider.test.ts`
- Create: `server/providers/fredProvider.ts`
- Create: `server/providers/fredProvider.test.ts`
- Create: `server/testing/fixtures/alpaca-news.json`
- Create: `server/testing/fixtures/alpaca-corporate-actions.json`
- Create: `server/testing/fixtures/fred-series.json`
- Create: `server/testing/fixtures/fred-releases.json`
- Modify: `server/routes/eventRoutes.ts`
- Modify: `server/routes/eventRoutes.test.ts`
- Modify: `server/routes/companyRoutes.ts`
- Modify: `server/app.ts`

**Interfaces:**
- Adds `AlpacaProvider.getNews(symbols, from, to)` and `getCorporateActions(symbols, from, to)`.
- Produces `FredProvider.getSeries(ids)` and `getReleaseEvents(from, to)`.
- Exposes `/api/companies/:symbol/news`, `/api/events`, and `/api/macro/series`.
- Uses 10-minute news TTL, 6-hour corporate-action TTL, and 24-hour macro TTL.

- [ ] **Step 1: Write failing Alpaca news and action tests**

```ts
test("keeps only news metadata and original links", async () => {
  const result = await provider.getNews(["NVDA"], "2026-08-01", "2026-08-07");
  expect(result.data[0]).toMatchObject({
    symbols: ["NVDA"],
    sourceName: "Benzinga",
    url: "https://example.test/news/nvda",
  });
  expect(result.data[0]).not.toHaveProperty("content");
});

test("normalizes dividends and splits as market events", async () => {
  const result = await provider.getCorporateActions(["AAPL"], "2026-08-01", "2026-08-31");
  expect(result.data.map((event) => event.type)).toEqual(["dividend", "split"]);
});
```

- [ ] **Step 2: Write failing FRED and unified-event tests**

```ts
test("normalizes selected macro observations without changing units", async () => {
  const result = await provider.getSeries(["CPIAUCSL", "UNRATE"]);
  expect(result.data[0]).toMatchObject({ seriesId: "CPIAUCSL", unit: "Index 1982-1984=100" });
});

test("marks date-only macro releases as all-day", async () => {
  const response = await app.inject({ url: "/api/events?from=2026-08-01&to=2026-08-31" });
  const cpi = response.json().data.find((event: { title: string }) => event.title.includes("CPI"));
  expect(cpi.timing).toBe("all-day");
  expect(cpi.scheduledAt).toMatch(/^2026-\d{2}-\d{2}$/);
});
```

- [ ] **Step 3: Run provider and route tests and verify failure**

Run:

```powershell
npm test -- server/providers/alpacaProvider.test.ts server/providers/fredProvider.test.ts server/routes/eventRoutes.test.ts
```

Expected: FAIL because news, actions, FRED, and unified routes are not implemented.

- [ ] **Step 4: Implement news and company actions**

Parse only headline, summary, source, timestamps, symbols, image URL, and original URL. Do not store or reproduce article bodies. Normalize Alpaca action types into dividend, split, or generic corporate-action events. Preserve source IDs for deduplication. Register the `news` manual-refresh handler.

- [ ] **Step 5: Implement the approved macro catalog**

Use a versioned catalog:

```ts
export const macroSeries = {
  federalFundsRate: "FEDFUNDS",
  cpi: "CPIAUCSL",
  coreCpi: "CPILFESL",
  pce: "PCEPI",
  corePce: "PCEPILFE",
  nonfarmPayrolls: "PAYEMS",
  unemploymentRate: "UNRATE",
  realGdp: "GDPC1",
} as const;
```

Cache observations and releases for 24 hours. Add the exact FRED attribution notice to macro envelopes. Register the `macro` manual-refresh handler.

- [ ] **Step 6: Merge and sort unified events**

Merge Finnhub earnings, Alpaca corporate actions, and FRED releases. Deduplicate by provider source ID; sort date-only events after timed events on the same date. If one source fails, return successful event groups plus a notice naming the unavailable group. Extend the `events` manual-refresh handler to refresh all three event groups.

- [ ] **Step 7: Verify milestone-two gateway and commit**

Run:

```powershell
npm test -- server/providers server/routes server/core
npm run build
git diff --check
git add server/providers server/testing/fixtures/alpaca-news.json server/testing/fixtures/alpaca-corporate-actions.json server/testing/fixtures/fred-*.json server/routes server/app.ts
git commit -m "feat: add news corporate actions and macro events"
```

---

### Task 11: Event UI, Deterministic Browser Server, Smoke Test, and Documentation

**Files:**
- Create: `src/features/research/CompanyNews.tsx`
- Create: `src/features/research/CompanyActions.tsx`
- Modify: `src/features/research/ResearchPage.tsx`
- Modify: `src/features/research/ResearchPage.test.tsx`
- Modify: `src/features/discovery/EventCalendar.tsx`
- Modify: `src/features/discovery/DiscoveryPage.tsx`
- Modify: `src/features/discovery/DiscoveryPage.test.tsx`
- Modify: `src/features/today/TodayPage.tsx`
- Modify: `src/features/today/TodayPage.test.tsx`
- Create: `server/testing/createFixtureProviders.ts`
- Create: `server/testing/e2eServer.ts`
- Create: `server/testing/liveSmoke.ts`
- Create: `server/testing/liveSmoke.test.ts`
- Create: `tests/e2e/live-market-data.spec.ts`
- Modify: `tests/e2e/discovery-flow.spec.ts`
- Modify: `tests/e2e/research-loop.spec.ts`
- Modify: `tests/e2e/portfolio-review.spec.ts`
- Modify: `playwright.config.ts`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-08-07-live-market-data.md`

**Interfaces:**
- Research renders news metadata and company actions independently.
- Discovery calendar renders unified event types and filters.
- Today renders the next seven days of earnings and macro events.
- Playwright runs against a fixture-backed Fastify server that also serves `dist`.
- `npm run test:data:smoke` checks configured live providers without fixed-price assertions.

- [ ] **Step 1: Write failing news and event interaction tests**

```tsx
test("research links to the original article without rendering article content", async () => {
  renderResearchWithNews();
  const link = await screen.findByRole("link", { name: "打开原文：NVIDIA 发布新产品" });
  expect(link).toHaveAttribute("href", "https://example.test/news/nvda");
  expect(screen.queryByText("licensed article body")).not.toBeInTheDocument();
});

test("filters the calendar to macro events", async () => {
  render(<DiscoveryPage marketClient={client} />);
  await user.click(screen.getByRole("button", { name: "事件日历" }));
  await user.selectOptions(screen.getByLabelText("事件类型"), "macro");
  expect(await screen.findByText("美国 CPI")).toBeVisible();
  expect(screen.queryByText("NVDA 财报")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Implement research, calendar, and Today event UI**

Render article metadata only. Use textual event-type badges. A stock event links to `/stocks/:symbol`; a macro event has no fabricated stock link. Show FRED attribution below macro data.

- [x] **Step 3: Create deterministic fixture providers and failing E2E flow**

```ts
test("uses live contracts from discovery through portfolio and stale fallback", async ({ page }) => {
  await page.goto("/discover");
  await expect(page.getByText("Alpaca")).toBeVisible();
  await expect(page.getByRole("row", { name: /NVDA/ })).toBeVisible();
  await page.getByRole("link", { name: "研究 NVDA" }).click();
  await expect(page.getByRole("heading", { name: /NVIDIA Corp/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /查看 10-K 原文/ })).toBeVisible();
  await expect(page.getByText("NVIDIA 发布新产品")).toBeVisible();

  await page.getByRole("button", { name: "保存投资逻辑" }).click();
  await page.getByRole("button", { name: "确认模拟买入" }).click();
  await page.getByRole("link", { name: "组合" }).click();
  await expect(page.getByText("报价来源：Alpaca")).toBeVisible();

  await page.request.post("/api/testing/fail-next", { data: { source: "alpaca", code: 429 } });
  await page.getByRole("button", { name: "刷新市场数据" }).click();
  await expect(page.getByText("旧缓存")).toBeVisible();
});
```

Run:

```powershell
npm run test:e2e -- tests/e2e/live-market-data.spec.ts
```

Expected: FAIL until the fixture-backed test server and Playwright configuration exist.

- [x] **Step 4: Implement the fixture-backed browser server**

`createFixtureProviders` returns deterministic provider implementations using the saved fixtures. `e2eServer.ts` uses an in-memory or temporary SQLite database, registers a test-only `POST /api/testing/fail-next` route, passes `dist` as `staticDir` to the shared app, and relies on the shared SPA fallback for non-API routes.

Configure:

```ts
export default defineConfig({
  testDir: "./tests/e2e",
  use: { baseURL: "http://127.0.0.1:4173", channel: "chrome" },
  webServer: {
    command: "npm run build && npm run test:e2e:server",
    port: 4173,
  },
});
```

Add `"test:e2e:server": "tsx server/testing/e2eServer.ts"` to `package.json`.

- [x] **Step 5: Implement safe live smoke checks**

`liveSmoke.ts` loads real configuration, prints one line per configured provider, and checks only:

- authentication succeeds;
- response schema parses;
- source and `asOf` exist;
- returned symbol matches the requested symbol.

It must skip unconfigured providers and must not assert a fixed price, percentage, event count, or filing date. Tests inject fake providers and assert secret values never appear in output.

- [x] **Step 6: Update existing E2E tests and README**

Keep existing thesis, discovery, watchlist, ledger, alert, and review assertions, but make them run through the fixture gateway. README must document:

```powershell
Copy-Item .env.example .env
npm install
npm run dev
npm test
npm run build
npm run test:e2e
npm run test:data:smoke
```

Also document provider signup links, local-only licensing assumption, cache location, TTL table, manual refresh, 429 cooldown, stale fallback, cache backup/removal, SEC user-agent format, FRED attribution, and stable Chrome requirement.

- [x] **Step 7: Run the complete validation suite**

Run:

```powershell
npm test
npm run build
npm run test:e2e
git diff --check
```

Expected:

- all unit, provider, gateway, and React interaction tests pass;
- TypeScript and Vite production build succeed;
- all stable-Chrome browser flows pass;
- no whitespace errors are reported.

- [ ] **Step 8: Verify secret exclusion and production mock exclusion**

Run:

```powershell
rg -n "ALPACA_API_SECRET_KEY|FINNHUB_API_KEY|FRED_API_KEY" dist
rg -n "mockMarketRepository|mockDiscoveryRepository" src --glob "!*.test.ts" --glob "!*.test.tsx"
git status --short
```

Expected:

- first command returns no matches;
- second command returns no production-page imports;
- only intended plan completion and documentation changes remain, plus the user-owned untracked `chrome/` directory.

- [ ] **Step 9: Mark the plan complete and commit**

Change each completed checkbox in this plan from `[ ]` to `[x]`, then:

```powershell
git add package.json package-lock.json playwright.config.ts README.md server/testing src/features/research src/features/discovery src/features/today tests/e2e docs/superpowers/plans/2026-08-07-live-market-data.md
git commit -m "test: validate live market data platform"
```

## Completion Criteria

- The production frontend reaches market data only through typed local `/api/*` contracts.
- Provider keys remain server-only and are absent from Git, logs, errors, and browser assets.
- Quotes, bars, profiles, SEC financials and filings, earnings, news, corporate actions, and approved macro series are normalized and cached.
- The approximately 100-symbol universe supports real-data screening and clearly reports incomplete coverage.
- Today, watchlist, research, discovery, portfolio, and event calendar display source, time, delay, and stale state.
- Paper portfolio valuation uses normalized live quotes and preserves missing-price behavior.
- A provider 429 or outage returns clearly labeled last-success data when available.
- Default tests are deterministic and offline; live smoke tests are explicit and non-brittle.
- Unit, integration, interaction, build, secret scans, and stable-Chrome E2E validation pass.
