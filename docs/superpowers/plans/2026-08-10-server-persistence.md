# Server Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace browser-owned business persistence and SQLite market cache with a single-user Fastify/PostgreSQL service, including an idempotent one-click browser migration and verified backup/restore.

**Architecture:** Docker Compose runs `web-api`, PostgreSQL and Redis. Kysely repositories own explicit `platform`, `core`, `monitor` and `market` schemas; public mutations use idempotency records and transactionally written Outbox events. React receives asynchronous HTTP repositories through one application context, while legacy local repositories remain read-only migration adapters.

**Tech Stack:** TypeScript, Fastify, Zod, PostgreSQL, `pg`, Kysely, Redis, BullMQ, React, Vitest, Playwright, Docker Compose

## Global Constraints

- Deployment is single-user and local; do not add login, sessions or remote exposure.
- `web-api` binds to `127.0.0.1`; PostgreSQL and Redis are Compose-internal only.
- PostgreSQL is the only durable application source of truth; Redis contains only rebuildable jobs.
- Preserve all browser IDs, versions and timestamps during migration.
- Immutable thesis versions, ledger events, evaluations, snapshots and reviews are append-only.
- Browser source keys remain untouched as a read-only backup after migration.
- The performance cache and current SQLite market cache are derived and are not imported.
- Every public mutation requires `Idempotency-Key`; conflicting reuse returns `409 IDEMPOTENCY_CONFLICT`.
- Production pages must not import browser business repositories when this milestone completes.
- Preserve existing fresh/stale/unavailable, provider provenance and failure-degradation semantics.
- Place contracts consumed by both browser and server under `shared/`; server code must not import React components or browser repository implementations.

---

### Task 1: Docker Compose, PostgreSQL Connection, and Migrations

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.env.example`
- Create: `Dockerfile`
- Create: `docker-compose.yml`
- Create: `docker-compose.test.yml`
- Create: `.dockerignore`
- Create: `server/db/database.ts`
- Create: `server/db/types.ts`
- Create: `server/db/migrations/001_platform.ts`
- Create: `server/db/migrate.ts`
- Create: `server/db/database.integration.test.ts`
- Create: `vitest.integration.config.ts`
- Modify: `server/config.ts`
- Modify: `server/config.test.ts`
- Modify: `tsconfig.json`
- Modify: `tsconfig.server.json`

**Interfaces:**
- Produces: `createDatabase(connectionString): Kysely<Database>` and `migrateToLatest(database): Promise<void>`.
- Produces: `ServerConfig.databaseUrl`, `ServerConfig.redisUrl`, `ServerConfig.internalServiceToken`.
- Consumes: existing `loadServerConfig` validation style and current Node ESM setup.

- [ ] **Step 1: Add failing configuration and database integration tests**

```ts
test("requires postgres, redis, and an internal service token", () => {
  expect(() => loadServerConfig({ SEC_USER_AGENT: "stock_m test@example.com" })).toThrow();
});

test("migrates the platform schema against postgres", async () => {
  const database = createDatabase(process.env.TEST_DATABASE_URL!);
  await migrateToLatest(database);
  const schemas = await sql<{ schema_name: string }>`select schema_name from information_schema.schemata`.execute(database);
  expect(schemas.rows.map((row) => row.schema_name)).toEqual(expect.arrayContaining(["platform", "core", "monitor", "market"]));
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npm test -- server/config.test.ts server/db/database.integration.test.ts`  
Expected: FAIL because the database configuration and migration modules do not exist.

- [ ] **Step 3: Add runtime dependencies and scripts**

Add `pg`, `kysely`, `bullmq`, and `ioredis` to dependencies; add `@types/pg` to devDependencies. Add these scripts:

```json
{
  "db:migrate": "tsx server/db/migrate.ts",
  "test:integration": "vitest run --config vitest.integration.config.ts",
  "compose:up": "docker compose up -d --build",
  "compose:down": "docker compose down"
}
```

Create `vitest.integration.config.ts` with Node environment, `server/**/*.integration.test.ts` inclusion, a 30-second timeout and one worker so schema-reset tests cannot race. Add `shared` to both TypeScript project includes.

- [ ] **Step 4: Implement the typed database and first migration**

```ts
export interface Database {
  "platform.schema_migration": { name: string; appliedAt: Date };
  "platform.idempotency_record": { key: string; fingerprint: string; statusCode: number; responseJson: unknown; createdAt: Date; expiresAt: Date };
  "platform.outbox_event": { id: string; topic: string; aggregateId: string; payloadJson: unknown; occurredAt: Date; publishedAt: Date | null; attempts: number };
  "platform.inbox_event": { consumer: string; eventId: string; consumedAt: Date };
  "platform.dead_letter": { id: string; consumer: string; eventId: string; reason: string; payloadJson: unknown; createdAt: Date };
  "platform.installation": { id: string; createdAt: Date };
}

export const createDatabase = (connectionString: string) => new Kysely<Database>({
  dialect: new PostgresDialect({ pool: new Pool({ connectionString }) }),
});
```

Migration `001_platform` must create the four schemas, platform tables, primary keys, unique `(consumer,event_id)` Inbox constraint, Outbox unpublished index, and one installation row.

- [ ] **Step 5: Add Compose health checks and private networking**

`docker-compose.yml` must expose only `127.0.0.1:${PORT:-8787}:8787`; `postgres:5432` and `redis:6379` remain un-published. Health checks use `pg_isready`, `redis-cli ping`, and `/api/health`.

- [ ] **Step 6: Run integration tests and build**

Run: `docker compose -f docker-compose.test.yml up -d postgres redis`  
Run: `npm run test:integration -- server/db/database.integration.test.ts`  
Run: `npm run build`  
Expected: PASS.

- [ ] **Step 7: Commit Task 1**

```bash
git add package.json package-lock.json .env.example Dockerfile docker-compose.yml docker-compose.test.yml .dockerignore vitest.integration.config.ts tsconfig.json tsconfig.server.json server/db server/config.ts server/config.test.ts
git commit -m "feat: bootstrap postgres service platform"
```

### Task 2: Idempotency, Transactional Outbox, and Redis Publisher

**Files:**
- Create: `server/platform/idempotencyRepository.ts`
- Create: `server/platform/idempotencyRepository.integration.test.ts`
- Create: `server/platform/outboxRepository.ts`
- Create: `server/platform/outboxRepository.integration.test.ts`
- Create: `server/platform/outboxPublisher.ts`
- Create: `server/platform/outboxPublisher.integration.test.ts`
- Create: `server/platform/withIdempotency.ts`
- Create: `server/platform/withIdempotency.test.ts`
- Modify: `server/app.ts`
- Modify: `server/app.test.ts`
- Modify: `server/index.ts`
- Modify: `server/testing/e2eServer.ts`

**Interfaces:**
- Produces: `withIdempotency(request, reply, command)` for all public mutations.
- Produces: `OutboxRepository.append(transaction, event)` and `OutboxPublisher.publishBatch(limit)`.
- Produces topics used by later milestones without starting worker processes.

- [ ] **Step 1: Write failing idempotency and Outbox tests**

```ts
test("replays the original response for the same key and fingerprint", async () => {
  const first = await harness.execute("key-1", { symbol: "NVDA" });
  const second = await harness.execute("key-1", { symbol: "NVDA" });
  expect(second).toEqual(first);
  expect(harness.command).toHaveBeenCalledTimes(1);
});

test("rejects a reused key with another fingerprint", async () => {
  await harness.execute("key-1", { symbol: "NVDA" });
  await expect(harness.execute("key-1", { symbol: "AMD" })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
});

test("publishes an outbox row once and marks it after BullMQ accepts it", async () => {
  await outbox.append(database, event);
  await publisher.publishBatch(100);
  expect(queue.add).toHaveBeenCalledWith(event.topic, event.payloadJson, expect.objectContaining({ jobId: event.id }));
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- server/platform/withIdempotency.test.ts`  
Run: `npm run test:integration -- server/platform`  
Expected: FAIL because platform repositories do not exist.

- [ ] **Step 3: Implement stable fingerprints and replay**

```ts
export interface StoredHttpResponse { statusCode: number; body: unknown; }

export async function withIdempotency(
  input: { key: string; body: unknown; route: string },
  command: (trx: Transaction<Database>) => Promise<StoredHttpResponse>,
): Promise<StoredHttpResponse> {
  const fingerprint = sha256(canonicalJson({ route: input.route, body: input.body }));
  return database.transaction().execute(async (trx) => idempotency.execute(trx, input.key, fingerprint, command));
}
```

Store successful and deterministic 4xx command responses; do not store transient 5xx responses. Expire ordinary command records after 30 days; migration and broker command records do not expire.

- [ ] **Step 4: Implement Outbox publishing and Inbox helpers**

Select unpublished rows with `FOR UPDATE SKIP LOCKED`, enqueue with `jobId=event.id`, increment attempts on failure, and set `published_at` only after Redis accepts the job. Export `consumeOnce(trx, consumer, eventId, effect)` for later workers.

- [ ] **Step 5: Register request IDs and idempotency errors in Fastify**

Update `buildApp` so all error responses include `requestId`; map missing idempotency keys on mutation routes to `400 IDEMPOTENCY_KEY_REQUIRED` and conflicting reuse to `409`. Start one `OutboxPublisher` polling loop from `server/index.ts`, inject a fake/manual publisher in E2E, and stop it during graceful shutdown.

- [ ] **Step 6: Run unit/integration tests**

Run: `npm test -- server/platform/withIdempotency.test.ts server/app.test.ts`  
Run: `npm run test:integration -- server/platform`  
Expected: PASS, including duplicate queue delivery.

- [ ] **Step 7: Commit Task 2**

```bash
git add server/platform server/app.ts server/app.test.ts server/index.ts server/testing/e2eServer.ts
git commit -m "feat: add idempotent outbox commands"
```

### Task 3: Discovery and Watchlist Server Repositories

**Files:**
- Create: `server/db/migrations/002_discovery_watchlists.ts`
- Create: `server/discovery/discoveryStateRepository.ts`
- Create: `server/discovery/discoveryStateRepository.integration.test.ts`
- Create: `server/watchlists/watchlistRepository.ts`
- Create: `server/watchlists/watchlistRepository.integration.test.ts`
- Create: `server/routes/stateDiscoveryRoutes.ts`
- Create: `server/routes/stateDiscoveryRoutes.test.ts`
- Create: `src/features/discovery/discoveryStateApiRepository.ts`
- Create: `src/features/discovery/discoveryStateApiRepository.test.ts`
- Create: `src/features/watchlist/watchlistApiRepository.ts`
- Create: `src/features/watchlist/watchlistApiRepository.test.ts`
- Modify: `src/features/discovery/DiscoveryPage.tsx`
- Modify: `src/features/watchlist/WatchlistPage.tsx`
- Create: `src/app/apiClient.ts`
- Create: `src/app/apiClient.test.ts`
- Create: `shared/discoveryState.ts`
- Create: `shared/watchlist.ts`
- Modify: `src/features/discovery/domain.ts`
- Modify: `src/features/watchlist/watchlistRepository.ts`
- Modify: `server/app.ts`
- Modify: `server/index.ts`

**Interfaces:**
- Produces: async saved-screen, user-universe and watchlist repository interfaces.
- Consumes: Task 2 idempotency wrapper and existing discovery/watchlist domain types.

- [ ] **Step 1: Add failing PostgreSQL repository contract tests**

Use the current local repository behaviors as the contract:

```ts
expect(await watchlists.createGroup("AI Infrastructure")).toMatchObject({ name: "AI Infrastructure", symbols: [], order: 0 });
await watchlists.addSymbol(group.id, "nvda");
await watchlists.addSymbol(group.id, "NVDA");
expect((await watchlists.list())[0].symbols).toEqual(["NVDA"]);
await watchlists.removeGroup(group.id);
expect(await watchlists.list()).toEqual([]);
expect(await watchlists.listDeleted()).toHaveLength(1);
```

Also cover saved-screen validation, stable IDs, universe symbol normalization and optimistic version conflicts.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm run test:integration -- server/discovery server/watchlists`  
Expected: FAIL because schema/repositories are absent.

- [ ] **Step 3: Create normalized tables and repository methods**

Migration `002` creates `core.user_universe_symbol`, `core.saved_screen`, `core.watchlist_group` and `core.watchlist_symbol`. Use `numeric order_index`, soft-delete timestamps and unique normalized symbols per group.

Move the transport-safe saved-screen/user-universe DTOs into `shared/discoveryState.ts` and `WatchlistGroup` into `shared/watchlist.ts`; local migration repositories, HTTP repositories and server repositories import the same definitions.

```ts
export interface AsyncWatchlistRepository {
  list(): Promise<WatchlistGroup[]>;
  listDeleted(): Promise<WatchlistGroup[]>;
  createGroup(name: string, key: string): Promise<WatchlistGroup>;
  renameGroup(id: string, name: string, version: number, key: string): Promise<WatchlistGroup>;
  addSymbol(id: string, symbol: string, key: string): Promise<WatchlistGroup>;
  removeSymbol(id: string, symbol: string, key: string): Promise<WatchlistGroup>;
  moveGroup(id: string, targetIndex: number, key: string): Promise<void>;
}
```

- [ ] **Step 4: Add `/api/v1` routes and client repositories**

Routes validate symbols and names with Zod, require `Idempotency-Key` on writes, and return `409 VERSION_CONFLICT` with the latest group/screen. Create `ApiClient.requestJson<T>({method,path,body,idempotencyKey,signal})` in `src/app/apiClient.ts`; it parses the existing `{code,message,retryable}` error shape. Client repositories use it instead of duplicating `fetch`.

Register the routes through explicit repository dependencies in `buildApp`; `server/index.ts` constructs the PostgreSQL repositories and passes them to the app.

- [ ] **Step 5: Refactor pages to accept asynchronous repositories**

Move local repository construction out of `DiscoveryPage` and `WatchlistPage`. Accept injected repository props with defaults supplied later by the application repository context. Keep pure rendering and interaction tests using fakes.

- [ ] **Step 6: Run feature, route and integration tests**

Run: `npm test -- src/features/discovery src/features/watchlist server/routes/stateDiscoveryRoutes.test.ts`  
Run: `npm run test:integration -- server/discovery server/watchlists`  
Expected: PASS.

- [ ] **Step 7: Commit Task 3**

```bash
git add server/db/migrations/002_discovery_watchlists.ts server/discovery server/watchlists server/routes/stateDiscoveryRoutes* server/app.ts server/index.ts shared/discoveryState.ts shared/watchlist.ts src/app/apiClient* src/features/discovery src/features/watchlist
git commit -m "feat: persist discovery and watchlists"
```

### Task 4: Thesis and Monitoring-History Persistence

**Files:**
- Create: `server/db/migrations/003_thesis_monitoring.ts`
- Create: `server/thesis/thesisRepository.ts`
- Create: `server/thesis/thesisRepository.integration.test.ts`
- Create: `server/monitoring/monitorStateRepository.ts`
- Create: `server/monitoring/monitorStateRepository.integration.test.ts`
- Create: `server/routes/thesisStateRoutes.ts`
- Create: `server/routes/thesisStateRoutes.test.ts`
- Create: `server/routes/monitorStateRoutes.ts`
- Create: `server/routes/monitorStateRoutes.test.ts`
- Create: `src/features/thesis/thesisApiRepository.ts`
- Create: `src/features/monitoring/monitorApiRepository.ts`
- Modify: `src/features/research/ResearchPage.tsx`
- Modify: `src/features/monitoring/ResearchMonitorPanel.tsx`
- Modify: `src/features/monitoring/MonitorPage.tsx`
- Modify: `src/features/monitoring/ReviewQueue.tsx`
- Modify: `src/features/today/TodayPage.tsx`
- Create: `shared/thesis.ts`
- Create: `shared/monitoring.ts`
- Modify: `src/features/thesis/localThesisRepository.ts`
- Modify: `src/features/monitoring/domain.ts`
- Modify: `server/app.ts`
- Modify: `server/index.ts`

**Interfaces:**
- Produces: `ThesisStateService` and `MonitorStateService` async APIs.
- Preserves: unique `(symbol, version)`, immutable condition versions/evaluations/reviews and append-only alert actions.

- [x] **Step 1: Write failing repository invariants**

```ts
test("allocates thesis versions transactionally", async () => {
  const [left, right] = await Promise.all([repository.create(draft), repository.create(draft)]);
  expect([left.version, right.version].sort()).toEqual([1, 2]);
});

test("appends alert actions without rewriting the alert fact", async () => {
  await repository.recordAlert(alert);
  await repository.act(alert.id, { type: "snooze", until: "2026-08-12T00:00:00Z" });
  expect((await repository.getAlert(alert.id)).createdAt).toBe(alert.createdAt);
  expect(await repository.listAlertActions(alert.id)).toHaveLength(1);
});
```

- [x] **Step 2: Run focused tests and verify RED**

Run: `npm run test:integration -- server/thesis server/monitoring`  
Expected: FAIL.

- [x] **Step 3: Implement schema and PostgreSQL repositories**

Create `core.thesis_version`, `core.thesis_condition`, `monitor.condition_evaluation`, `monitor.alert`, `monitor.alert_action` and `monitor.thesis_review`. Use JSONB only for typed condition targets and immutable snapshots; keep searchable symbol/status/deadline fields in columns.

Move `Thesis` and transport-safe monitoring DTOs into `shared/thesis.ts` and `shared/monitoring.ts`. Re-export them from existing feature modules during the cutover so current imports compile, then update server/client repositories to use the shared paths.

- [x] **Step 4: Implement API routes and HTTP repositories**

Provide list/latest/history/create routes for theses, condition create/soft-delete/version-copy commands, evaluation/alert timelines and alert action commands. Reject edits to old thesis versions with `409 THESIS_VERSION_NOT_CURRENT`. Register both route groups from `buildApp` and construct their PostgreSQL repositories in `server/index.ts`.

- [x] **Step 5: Refactor Today, Research and Monitor consumers**

Replace synchronous constructor reads with loading/error/ready state. Preserve current corrupt-record recovery notices by converting server quarantine/import notices into the same non-blocking UI copy.

- [x] **Step 6: Run all monitoring and research tests**

Run: `npm test -- src/features/thesis src/features/monitoring src/features/research src/features/today server/routes/thesisStateRoutes.test.ts server/routes/monitorStateRoutes.test.ts`  
Run: `npm run test:integration -- server/thesis server/monitoring`  
Expected: PASS.

- [x] **Step 7: Commit Task 4**

```bash
git add server/db/migrations/003_thesis_monitoring.ts server/thesis server/monitoring server/routes/thesisStateRoutes* server/routes/monitorStateRoutes* server/app.ts server/index.ts shared/thesis.ts shared/monitoring.ts src/features/thesis src/features/monitoring src/features/research src/features/today
git commit -m "feat: persist thesis monitoring state"
```

### Task 5: Manual Portfolio, Reviews, and Split Decisions

**Files:**
- Create: `server/db/migrations/004_manual_portfolio.ts`
- Create: `server/portfolio/manualPortfolioRepository.ts`
- Create: `server/portfolio/manualPortfolioRepository.integration.test.ts`
- Create: `server/portfolio/portfolioReviewRepository.ts`
- Create: `server/portfolio/portfolioReviewRepository.integration.test.ts`
- Create: `server/routes/manualPortfolioRoutes.ts`
- Create: `server/routes/manualPortfolioRoutes.test.ts`
- Create: `src/features/portfolio/portfolioApiRepository.ts`
- Create: `src/features/portfolio/portfolioApiRepository.test.ts`
- Modify: `src/features/portfolio/PortfolioPage.tsx`
- Modify: `src/features/portfolio/performance/usePortfolioPerformance.ts`
- Create: `shared/portfolio.ts`
- Modify: `src/features/portfolio/domain.ts`
- Modify: `server/app.ts`
- Modify: `server/index.ts`

**Interfaces:**
- Produces: server-owned manual settings, ledger, ignored splits, alerts, snapshots and reviews.
- Consumes: existing `LedgerEvent`, `PortfolioSettings`, `WeeklyReview` and performance engine contracts.

- [ ] **Step 1: Add failing ledger and review repository tests**

Cover append-only event order, unique split `sourceEventId`, withdrawal cash checks, sell quantity checks, immutable weekly review versions and exact `numeric(28,8)` round trips.

```ts
expect(await ledger.append(split, "key-a")).toEqual(await ledger.append(split, "key-a"));
await expect(ledger.append(overSell, "key-b")).rejects.toMatchObject({ code: "INSUFFICIENT_QUANTITY" });
expect((await reviews.submit(input)).version).toBe(1);
expect((await reviews.submit(input)).version).toBe(2);
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npm run test:integration -- server/portfolio`  
Expected: FAIL.

- [ ] **Step 3: Implement normalized portfolio tables**

Create one `manual_portfolio`, settings, append-only ledger event, ignored split decision, portfolio alert/action, snapshot and weekly review tables. Store discriminated ledger fields in typed nullable columns plus a `type` check constraint; do not store events as opaque JSON.

Move ledger/settings/alert/review transport types into `shared/portfolio.ts` and re-export them from `src/features/portfolio/domain.ts`. Database repositories, route schemas and client adapters must use the same discriminated union.

- [ ] **Step 4: Implement routes and client adapter**

Expose settings, ledger, split-decision, alert-action, snapshot and review commands. Return the same deterministic domain errors currently shown by the page. Add a batch read endpoint returning one consistent portfolio revision for page bootstrap. Register the route group and construct repositories in the production composition root.

- [ ] **Step 5: Refactor PortfolioPage and performance loader**

Load settings/events/decisions/reviews asynchronously from `PortfolioApiRepository`. Pass immutable arrays into existing analytics/performance code. A failed mutation must not update React state optimistically; reload the server revision after success.

- [ ] **Step 6: Run portfolio and performance tests**

Run: `npm test -- src/features/portfolio server/routes/manualPortfolioRoutes.test.ts`  
Run: `npm run test:integration -- server/portfolio`  
Expected: PASS, including the 226 existing regression tests.

- [ ] **Step 7: Commit Task 5**

```bash
git add server/db/migrations/004_manual_portfolio.ts server/portfolio server/routes/manualPortfolioRoutes* server/app.ts server/index.ts shared/portfolio.ts src/features/portfolio
git commit -m "feat: persist manual portfolio state"
```

### Task 6: Validated Browser Migration API and Wizard

**Files:**
- Create: `server/db/migrations/005_browser_migration.ts`
- Create: `server/migration/browserMigrationSchemas.ts`
- Create: `server/migration/browserMigrationService.ts`
- Create: `server/migration/browserMigrationService.integration.test.ts`
- Create: `server/routes/browserMigrationRoutes.ts`
- Create: `server/routes/browserMigrationRoutes.test.ts`
- Create: `src/features/migration/browserStateExport.ts`
- Create: `src/features/migration/browserStateExport.test.ts`
- Create: `src/features/migration/MigrationWizard.tsx`
- Create: `src/features/migration/MigrationWizard.test.tsx`
- Create: `src/features/migration/migrationApiClient.ts`
- Modify: `src/app/App.tsx`
- Modify: `server/app.ts`
- Modify: `server/index.ts`

**Interfaces:**
- Produces: canonical `BrowserMigrationDocumentV1`, preview, import and receipt contracts.
- Consumes: Tasks 3–5 repositories in one database transaction.

- [ ] **Step 1: Write failing export validation tests**

```ts
test("quarantines one invalid item without dropping valid siblings", async () => {
  localStorage.setItem("stock_m:watchlists:v1", JSON.stringify([validGroup, { id: 42 }]));
  const document = await exportBrowserState(localStorage, fixedNow);
  expect(document.categories.watchlists.valid).toEqual([validGroup]);
  expect(document.categories.watchlists.quarantined).toHaveLength(1);
  expect(document.manifest.sha256).toMatch(/^[a-f0-9]{64}$/);
});
```

Add tests for every recognized key, canonical key ordering, full-document hash, storage quota failure and exclusion of performance cache.

The recognized source keys are exactly:

```ts
export const migrationKeys = [
  "stock_m:user-universe:v1", "stock_m:saved-screens:v1", "stock_m:watchlists:v1", "stock_m:theses",
  "stock_m:thesis-conditions:v1", "stock_m:condition-evaluations:v1", "stock_m:monitor-alerts:v1", "stock_m:thesis-reviews:v1",
  "stock_m:portfolio-ledger:v1", "stock_m:portfolio-settings:v1", "stock_m:ignored-splits:v1", "stock_m:portfolio-alerts:v1",
  "stock_m:portfolio-snapshots:v1", "stock_m:portfolio-reviews:v1",
] as const;
```

- [ ] **Step 2: Run client migration tests and verify RED**

Run: `npm test -- src/features/migration`  
Expected: FAIL.

- [ ] **Step 3: Implement canonical export and immutable backup**

```ts
export interface BrowserMigrationDocumentV1 {
  version: 1;
  exportedAt: string;
  browserId: string;
  categories: Record<MigrationCategory, { valid: unknown[]; quarantined: QuarantinedRecord[]; sha256: string }>;
  rawStorage: Record<string, string>;
  manifest: { totalValid: number; totalQuarantined: number; sha256: string };
}
```

Use Web Crypto SHA-256 over canonical UTF-8 JSON. Try to write `stock_m:server-migration-backup:v1` and always provide a Blob download. Import is enabled when the immutable local write succeeds or, after a quota failure, when the browser reports a completed user-initiated download; source business keys remain untouched in both cases.

- [ ] **Step 4: Write failing server import tests**

Cover empty target success, full rollback on one insert failure, preserved IDs/timestamps, identical retry, non-empty target conflict, hash mismatch and category-count verification.

- [ ] **Step 5: Implement preview/import/receipt transaction**

Create `platform.browser_migration_receipt` with unique document hash, category counts/hashes and completed timestamp. Lock the installation row during import, verify all target category counts are zero, call each repository’s `importPreservingIdentity` method, verify counts, and write the receipt before commit.

Register preview/import/receipt routes with the fully constructed migration service in `server/index.ts`; the service receives every Task 3–5 import repository explicitly.

- [ ] **Step 6: Implement the blocking migration wizard**

States are `detecting`, `preview`, `backing-up`, `importing`, `verifying`, `complete` and `blocked`. Do not render normal routes until the server has a receipt or all recognized keys are empty. On success store `stock_m:server-migration-receipt:v1` without deleting source keys.

- [ ] **Step 7: Run unit, integration and component tests**

Run: `npm test -- src/features/migration server/routes/browserMigrationRoutes.test.ts`  
Run: `npm run test:integration -- server/migration`  
Expected: PASS.

- [ ] **Step 8: Commit Task 6**

```bash
git add server/db/migrations/005_browser_migration.ts server/migration server/routes/browserMigrationRoutes* server/app.ts server/index.ts src/features/migration src/app/App.tsx
git commit -m "feat: migrate browser state to postgres"
```

### Task 7: PostgreSQL Market Cache and Shared Provider State

**Files:**
- Create: `server/db/migrations/006_market_cache.ts`
- Create: `server/cache/postgresMarketDataCache.ts`
- Create: `server/cache/postgresMarketDataCache.integration.test.ts`
- Modify: `server/core/providerTypes.ts`
- Modify: `server/core/marketDataGateway.ts`
- Modify: `server/core/marketDataGateway.test.ts`
- Modify: `server/index.ts`
- Modify: `server/testing/e2eServer.ts`
- Delete: `server/cache/sqliteMarketDataCache.ts`
- Delete: `server/cache/sqliteMarketDataCache.test.ts`
- Remove dependency: `better-sqlite3`, `@types/better-sqlite3`

**Interfaces:**
- Produces: async `MarketDataCache` with get/put/cooldown/health/refresh-attempt methods.
- Preserves: last-success fallback, TTLs, notices and source/as-of semantics.

- [ ] **Step 1: Port the cache contract to async failing tests**

```ts
await cache.put(record);
expect(await cache.get(record.key)).toEqual(record);
await Promise.all([cache.put(older), cache.put(newer)]);
expect((await cache.get(record.key))?.fetchedAt).toBe(newer.fetchedAt);
```

Cover invalid data rejection, provider cooldown sharing, health counts and compare-and-set ordering.

- [ ] **Step 2: Run cache/gateway tests and verify RED**

Run: `npm run test:integration -- server/cache/postgresMarketDataCache.integration.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Create market tables and async cache**

Create `market.cache_entry`, `market.provider_state` and `market.refresh_attempt`. Store validated payload as JSONB, timestamps as `timestamptz`, and update only when `excluded.fetched_at >= cache_entry.fetched_at`.

- [ ] **Step 4: Convert MarketDataGateway to await cache operations**

All cache reads, writes, cooldown updates and health checks become asynchronous. Update every route/provider test fake to implement the async contract; do not add a synchronous compatibility layer.

- [ ] **Step 5: Switch production and E2E composition roots**

`server/index.ts` creates one Kysely database, migrates before app construction, and injects `PostgresMarketDataCache`. The E2E server uses the test PostgreSQL database and truncates owned schemas between suites.

- [ ] **Step 6: Remove SQLite dependencies and rerun market tests**

Run: `npm test -- server/core server/routes server/providers`  
Run: `npm run test:integration -- server/cache`  
Run: `npm run build`  
Expected: PASS and `rg "better-sqlite3|SqliteMarketDataCache" server package.json` returns no matches.

- [ ] **Step 7: Commit Task 7**

```bash
git add package.json package-lock.json server/db/migrations/006_market_cache.ts server/cache server/core server/index.ts server/testing/e2eServer.ts
git commit -m "feat: move market cache to postgres"
```

### Task 8: Application Repository Context and Production Cutover

**Files:**
- Create: `src/app/repositories.tsx`
- Create: `src/app/repositories.test.tsx`
- Create: `src/app/serverReadiness.ts`
- Create: `src/app/ServerStateGate.tsx`
- Create: `src/app/ServerStateGate.test.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/main.tsx`
- Modify: all production page constructors under `src/features/**`
- Retain: local repositories only for migration readers and isolated unit tests

**Interfaces:**
- Produces: `RepositoryProvider` and `useRepositories()` with the complete HTTP bundle.
- Consumes: Tasks 3–6 client repositories and migration receipt.

- [ ] **Step 1: Write failing context and readiness tests**

```tsx
render(<RepositoryProvider value={fakeRepositories}><WatchlistPage /></RepositoryProvider>);
expect(await screen.findByText("AI Infrastructure")).toBeVisible();

render(<ServerStateGate health={rejectedHealth}><AppRoutes /></ServerStateGate>);
expect(screen.getByRole("alert")).toHaveTextContent("服务端数据暂不可用");
```

- [ ] **Step 2: Run app tests and verify RED**

Run: `npm test -- src/app`  
Expected: FAIL.

- [ ] **Step 3: Implement repository composition**

```ts
export interface ApplicationRepositories {
  discovery: DiscoveryStateRepository;
  watchlists: AsyncWatchlistRepository;
  theses: ThesisApiRepository;
  monitoring: MonitorApiRepository;
  portfolio: PortfolioApiRepository;
  migration: MigrationApiClient;
}
```

Create one default bundle backed by `/api/v1`; tests inject fakes. `ServerStateGate` checks API/database readiness, then migration receipt, then renders routes.

- [ ] **Step 4: Remove production-page local repository construction**

Each page obtains repositories through `useRepositories` or explicit props. Local repository imports remain permitted only in `src/features/migration/browserStateExport.ts` and `*.test.*` files.

- [ ] **Step 5: Add a production import scan test**

Create a test/script that fails if a non-test, non-migration source imports `LocalThesisRepository`, `PortfolioLedger`, `WatchlistRepository`, `SavedScreenRepository`, monitoring local repositories, review repositories or `localStorage` business keys.

- [ ] **Step 6: Run all frontend tests and build**

Run: `npm test`  
Run: `npm run build`  
Expected: PASS and production repository scan count is zero.

- [ ] **Step 7: Commit Task 8**

```bash
git add src/app src/main.tsx src/features
git commit -m "feat: cut production state over to api"
```

### Task 9: Health, Backup/Restore, and Compose Operations

**Files:**
- Create: `server/platform/healthService.ts`
- Create: `server/platform/healthService.test.ts`
- Create: `scripts/backup.ps1`
- Create: `scripts/restore.ps1`
- Create: `scripts/verify-backup.ps1`
- Modify: `server/app.ts`
- Modify: `server/index.ts`
- Modify: `docker-compose.yml`
- Modify: `README.md`

**Interfaces:**
- Produces: readiness/liveness payloads and recoverable PostgreSQL backup workflow.

- [ ] **Step 1: Write failing health aggregation tests**

Assert `/api/health` returns `ready: false` when PostgreSQL is unavailable, reports Redis degradation separately, includes migration version, and never includes connection strings or tokens.

- [ ] **Step 2: Implement liveness/readiness and graceful shutdown**

Add `/api/health/live` and `/api/health/ready`. On SIGTERM stop accepting requests, stop the Outbox publisher, drain in-flight operations, close Redis/database pools and exit nonzero if shutdown exceeds 20 seconds.

- [ ] **Step 3: Implement backup manifest and verification scripts**

`backup.ps1` runs `pg_dump --format=custom`, computes SHA-256 and writes `{appVersion,migrationVersion,createdAt,sha256}`. `verify-backup.ps1` checks the hash. `restore.ps1` requires worker services stopped, restores to a temporary database, runs migrations in check-only mode and swaps only after integrity queries pass.

- [ ] **Step 4: Test restart and backup recovery**

Run: `docker compose up -d --build`  
Create a watchlist/thesis/ledger fixture through API, restart all containers, verify it remains, create a dump, restore into the test stack and verify category counts/hashes.

- [ ] **Step 5: Document operations**

README must include Compose startup, `.env`, migration UX, backup/restore, health commands, exposed ports, volume names and the rule that browser source keys remain a read-only backup.

- [ ] **Step 6: Commit Task 9**

```bash
git add server/platform/healthService* server/app.ts server/index.ts scripts docker-compose.yml README.md
git commit -m "feat: operate persistent service stack"
```

### Task 10: Fixture-Backed Persistence E2E and Completion

**Files:**
- Create: `server/testing/resetTestDatabase.ts`
- Create: `tests/e2e/server-persistence.spec.ts`
- Modify: `server/testing/e2eServer.ts`
- Modify: `playwright.config.ts`
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-08-10-server-persistence.md`

**Interfaces:**
- Produces: deterministic browser proof for migration, restart, API-only writes and stale reads.

- [ ] **Step 1: Add the failing browser migration flow**

The test must seed all recognized localStorage categories, load the production app, verify preview/quarantine counts, download or observe backup creation, import, and verify Discovery, Watchlist, Research, Monitor, Portfolio and Journal data.

```ts
await page.reload();
await expect(page.getByText("迁移完成")).toBeVisible();
await expect(page.evaluate(() => localStorage.getItem("stock_m:portfolio-ledger:v1"))).resolves.not.toBeNull();
```

- [ ] **Step 2: Add idempotency, restart and conflict scenarios**

Replay the same migration request and assert one receipt; restart `web-api`/PostgreSQL test composition and verify data; seed a non-empty target and assert `MIGRATION_TARGET_NOT_EMPTY` without partial inserts.

- [ ] **Step 3: Extend fixture server with test-only reset/restart controls**

Register controls only in `server/testing/e2eServer.ts`. Production `buildApp` receives repositories but no testing routes. E2E reset truncates owned schemas and reapplies the one installation row.

- [ ] **Step 4: Run complete validation**

Run: `npm test`  
Run: `npm run test:integration`  
Run: `npm run build`  
Run: `npm run test:e2e`  
Run: `npm run test:data:smoke`  
Expected: every command exits 0.

- [ ] **Step 5: Run safety scans**

Run scans that assert:

```text
dist secret-name/value matches = 0
production browser business repository imports = 0
production fixture/mock imports = 0
production /api/testing routes = 0
better-sqlite3 and SqliteMarketDataCache references = 0
```

- [ ] **Step 6: Mark this plan complete and commit**

Update every completed checkbox only after the commands above pass.

```bash
git add tests/e2e/server-persistence.spec.ts server/testing playwright.config.ts README.md docs/superpowers/plans/2026-08-10-server-persistence.md
git commit -m "test: validate server persistence workflow"
```
