# Platform Services Roadmap Design

**Date:** 2026-08-10  
**Status:** Approved in design review  
**Scope:** Service architecture shared by server persistence, background monitoring/Web Push, and Alpaca Paper trading

## 1. Goal

Evolve `stock_m` from a browser-local workstation into a single-user, Docker Compose-hosted service platform without weakening its existing invariants: immutable investment history, explicit stale/unavailable states, deterministic monitoring, no browser-visible provider credentials, and no automatic trading.

The work is delivered as three sequential and independently testable milestones:

1. Server persistence and browser-data migration.
2. Background monitoring and Web Push.
3. Manually confirmed Alpaca Paper trading and broker reconciliation.

Each milestone has its own design and implementation plan. A milestone must satisfy its completion gate before the next one starts.

## 2. Confirmed Product Decisions

- Deployment remains single-user and local; no login or multi-user isolation is introduced.
- Docker Compose keeps the platform running when the browser page is closed.
- PostgreSQL is the only durable application state store.
- Redis and BullMQ carry scheduled and asynchronous jobs but are never the source of business truth.
- All existing browser-owned business data moves to the server through a validated, previewed, one-click migration.
- The browser retains a read-only migration backup and migration receipt; it retains only rebuildable caches for normal operation.
- Monitoring uses five-minute price checks during regular U.S. market hours and daily financial/news/event checks, with one catch-up evaluation after missed windows.
- Notifications are application inbox entries plus browser Web Push; email is excluded.
- Alpaca Paper is a separate portfolio from the existing manual simulated portfolio.
- Paper orders are initiated and confirmed by the user. Monitoring cannot create or send an order.
- Trading supports long-only market and limit orders, DAY/GTC time in force, integer shares, and Alpaca-supported fractional shares.
- Alpaca credentials and VAPID secrets come only from server environment variables.

## 3. System Topology

Docker Compose runs the following containers:

| Container | Responsibility | Durable writes |
| --- | --- | --- |
| `web-api` | Serves the production React build, public REST API, market-data gateway, validation, transactions, Outbox publishing, migration endpoints | `core`, `market`, command and Outbox tables |
| `monitor-worker` | Creates deterministic monitor runs, loads normalized snapshots, evaluates conditions, emits alert facts | `monitor` tables and Outbox |
| `notification-worker` | Consumes alert events, sends Web Push, manages retries and invalid subscriptions | `notification` delivery tables |
| `trading-worker` | Submits/cancels Alpaca Paper orders, consumes trade updates, reconciles account state | `broker` tables and broker ledger |
| `postgres` | Stores every durable business record, derived market cache, job audit, Outbox and Inbox | PostgreSQL volume |
| `redis` | BullMQ queues, delayed jobs, leases and retry metadata | Rebuildable Redis volume |

Only `web-api` is published to `127.0.0.1`. PostgreSQL and Redis are reachable only on the Compose network. Workers access standardized market snapshots through an authenticated internal API; they do not duplicate public provider adapters or cache policy.

## 4. Data Ownership

PostgreSQL uses schemas to make write ownership explicit:

- `core`: saved screens, user universe, watchlist groups, thesis versions, condition definitions, manual portfolio settings and ledger events, split decisions, portfolio alerts/actions, snapshots and reviews.
- `market`: provider cache entries, cache cooldowns, refresh audit and normalized source metadata.
- `monitor`: monitor runs, condition evaluations, alert facts and alert actions.
- `notification`: Push subscriptions and delivery attempts.
- `broker`: order intents, remote orders, fills, activities, account snapshots, reconciliation runs and immutable broker ledger events.
- `platform`: schema migrations, idempotency records, Outbox, per-consumer Inbox and dead letters.

A service may read another schema through a repository contract, but it may not mutate tables owned by another service. User actions against monitor alerts and broker orders are represented as commands or immutable action rows instead of cross-service updates.

## 5. Reliable Commands and Events

Every mutating public request carries an `Idempotency-Key`. The API stores the key, request fingerprint and final response. Reusing a key with a different fingerprint returns `409 IDEMPOTENCY_CONFLICT`; reusing it with the same fingerprint returns the original response.

Business state and an `outbox_event` are written in one PostgreSQL transaction. An Outbox publisher places events on BullMQ. Each consumer records the event ID in its Inbox in the same transaction as its local effects. Duplicate deliveries therefore produce no duplicate reminder, notification, order or ledger event.

Redis loss is recoverable: undelivered Outbox rows are republished, recurring schedules are recreated from PostgreSQL definitions, and uncertain broker commands are reconciled against Alpaca before any retry.

## 6. Technology Baseline

- Node.js and TypeScript for all services.
- Fastify and Zod for HTTP and runtime contracts.
- PostgreSQL with `pg` and Kysely for explicit SQL, typed queries and migrations.
- Redis and BullMQ for queues, delayed work and retry policy.
- `web-push` with VAPID for browser notification delivery.
- React PWA and a Service Worker for subscription management, push display and deep links.
- Docker Compose for local orchestration, health checks, volumes and dependency ordering.
- Vitest for unit/contract tests, real PostgreSQL/Redis for integration tests, and Playwright with stable Chrome for production-build E2E.

## 7. Cross-Cutting Security and Operations

- `web-api` binds to `127.0.0.1`; databases are not published externally.
- Internal worker endpoints require a server-generated bearer token present only on the Compose network.
- `ALPACA_PAPER_TRADING_ENABLED` defaults to `false`.
- Trading startup rejects any Alpaca base URL that is not the Paper environment.
- Secrets are redacted from logs and excluded from client bundles and API responses.
- JSON logs include `requestId`, `jobId`, `eventId`, `monitorRunId`, `orderIntentId` or `reconciliationRunId` as applicable.
- `/api/health` reports API, PostgreSQL and Redis readiness. Worker heartbeat endpoints report last success, last failure and queue lag.
- `scripts/backup.ps1` and `scripts/restore.ps1` wrap `pg_dump`/`pg_restore`; restore requires stopped workers and verifies schema version before replacement.

## 8. Delivery Order

### Milestone 1: Server Persistence

Build the Compose foundation, PostgreSQL schemas, repositories, API clients, migration flow, PostgreSQL market cache, backup/restore and persistence E2E. Production pages stop importing browser business repositories.

### Milestone 2: Background Monitoring and Web Push

Move monitor evaluations and alerts to server state, add BullMQ scheduling and catch-up, add Push subscription/delivery, and expose task/notification health. Existing stale-data rules remain unchanged.

### Milestone 3: Alpaca Paper Trading

Add a separate Paper portfolio, order intent/preflight/confirmation, idempotent trading worker, real-time and polling reconciliation, broker ledger and drift handling. No real-money URL or automatic order path is permitted.

## 9. Test Strategy

- Unit tests cover pure domain transitions, validators, schedule keys, migration normalization and reconciliation rules without containers.
- Integration tests run against real PostgreSQL and Redis and verify unique constraints, transactions, Outbox/Inbox, retries, Redis rebuild and process restart.
- Contract tests use recorded/synthetic Alpaca, Push and internal API fixtures; production code cannot import fixture providers.
- Chrome E2E runs the production build and fixture-backed services through migration, restart, monitoring, Push, order confirmation, partial fill, cancellation and drift.
- Live smoke remains read-only. It may validate provider authentication and Paper account visibility but never submits an order.
- Completion requires unit, integration, build, E2E, live smoke, key scan, production mock/fixture scan and production testing-route scan to pass.

## 10. Non-Goals

- Login, multi-user tenancy or cloud sync.
- Email notifications.
- Automatic trading, monitor-triggered pending orders, real-money trading, short selling, margin or options.
- More than one worker replica per service in the initial Compose deployment.
- Kubernetes, external managed queues or public internet exposure.

## 11. Related Specifications

- `docs/superpowers/specs/2026-08-10-server-persistence-design.md`
- `docs/superpowers/specs/2026-08-10-background-monitoring-push-design.md`
- `docs/superpowers/specs/2026-08-10-alpaca-paper-trading-design.md`
