# Server Persistence Design

**Date:** 2026-08-10  
**Status:** Approved in design review  
**Depends on:** `2026-08-10-platform-services-roadmap-design.md`

## 1. Goal

Move every user-owned business record from browser storage to a single-user Fastify/PostgreSQL service, preserve existing IDs and immutable history, and provide a validated one-click migration with a recoverable local backup. Browser storage remains only for rebuildable response/UI caches and a read-only migration receipt.

## 2. Data in Scope

The migration recognizes and validates these current keys:

- `stock_m:user-universe:v1`
- `stock_m:saved-screens:v1`
- `stock_m:watchlists:v1`
- `stock_m:theses`
- `stock_m:thesis-conditions:v1`
- `stock_m:condition-evaluations:v1`
- `stock_m:monitor-alerts:v1`
- `stock_m:thesis-reviews:v1`
- `stock_m:portfolio-ledger:v1`
- `stock_m:portfolio-settings:v1`
- `stock_m:ignored-splits:v1`
- `stock_m:portfolio-alerts:v1`
- `stock_m:portfolio-snapshots:v1`
- `stock_m:portfolio-reviews:v1`

The portfolio performance cache is derived and is not imported. Legacy migration markers and corrupt-record quarantine keys are recorded in the backup manifest but are not imported as business state.

## 3. PostgreSQL Model

All tables use UUID or preserved string IDs, `created_at`, and explicit version columns where the browser domain already has versions. Timestamps are stored as `timestamptz`; market dates are `date`; money and quantities use `numeric`, never floating-point database types.

| Aggregate | Core tables and invariants |
| --- | --- |
| Discovery | `user_universe_symbol`, `saved_screen`; normalized symbols; saved-screen IDs unique |
| Watchlists | `watchlist_group`, `watchlist_symbol`; soft deletion and stable group ordering |
| Thesis | `thesis_version`; unique `(symbol, version)`; prior versions immutable |
| Conditions | `thesis_condition`; bound to one thesis version; soft deletion only |
| Manual portfolio | `manual_portfolio`, `portfolio_settings`, `portfolio_ledger_event`, `ignored_split_decision`; ledger append-only; `source_event_id` unique when present |
| Portfolio review | `portfolio_alert`, `portfolio_alert_action`, `portfolio_snapshot`, `weekly_review`; review versions immutable |
| Monitoring history | Initially imported into `monitor.condition_evaluation`, `monitor.alert`, `monitor.alert_action`, `monitor.thesis_review`; milestone 2 becomes the sole writer |

The initial installation owns one `installation` row with a generated UUID. It is not an authenticated user and is never sent to third parties. The ID makes backup validation and a future tenancy migration possible without exposing multi-user concepts in the product.

## 4. Repository and API Boundary

Browser repository interfaces remain domain-oriented, but production implementations become asynchronous HTTP repositories. Pages may not import `Storage`-backed business repositories after migration.

Public routes use `/api/v1`:

- `/api/v1/discovery/universe` and `/api/v1/discovery/screens`
- `/api/v1/watchlists`
- `/api/v1/theses` and `/api/v1/theses/:thesisVersionId/conditions`
- `/api/v1/monitor/evaluations`, `/api/v1/monitor/alerts`, `/api/v1/monitor/reviews`
- `/api/v1/portfolios/manual/settings`, `/ledger`, `/split-decisions`, `/alerts`, `/snapshots`, `/reviews`
- `/api/v1/migrations/browser/preview`, `/import`, `/receipt`
- `/api/v1/backups/status`

Mutations use explicit commands rather than generic document replacement. Examples include `POST /watchlists`, `POST /watchlists/:id/symbols`, `POST /portfolio/ledger-events`, and `POST /monitor/alerts/:id/actions`. Immutable records expose no `PUT` route.

Responses retain the existing envelope fields `source`, `asOf`, `fetchedAt`, `expiresAt`, `stale`, `fallback` and `notices` where market provenance applies. Business records add an ETag/version token; stale edit tokens return `409 VERSION_CONFLICT` with the latest record.

## 5. Browser Migration Flow

### 5.1 Detection and Preview

On startup, the client calls `/api/v1/migrations/browser/receipt`. If no receipt exists and recognized local keys contain data, it opens a migration wizard. The wizard validates each record using the current domain schemas and shows valid, quarantined and total counts per category.

`POST /api/v1/migrations/browser/preview` accepts a manifest of category names, counts, stable IDs and SHA-256 hashes, not the data itself. The server reports whether it is empty, already imported, or in conflict.

### 5.2 Backup

Before import, the browser creates one canonical JSON document containing:

- schema version and export timestamp;
- installation/browser identifier;
- every recognized raw key/value;
- validation summary and quarantined records;
- per-category and whole-document SHA-256 hashes.

The user can download the JSON. The same document is stored under `stock_m:server-migration-backup:v1` and is never modified. If storage quota prevents this backup, import is blocked until the user downloads the file.

### 5.3 Import

`POST /api/v1/migrations/browser/import` carries the validated canonical records, manifest hash and `Idempotency-Key` equal to the whole-document hash. One PostgreSQL transaction inserts all categories while preserving IDs, versions and timestamps.

If server business tables are non-empty and the same import receipt does not exist, the server returns `409 MIGRATION_TARGET_NOT_EMPTY` plus category counts. It does not merge automatically. A repeated identical import returns the original receipt and creates no duplicate rows.

### 5.4 Verification and Cutover

The server returns category counts, hashes and receipt ID. The browser compares these with its manifest, stores `stock_m:server-migration-receipt:v1`, and switches repository bindings to HTTP. A mismatch leaves local repositories active and reports a blocking error; partial cutover is forbidden.

Local source keys remain untouched and are treated as read-only backup data. Normal writes go only to the server. A settings action can download the backup and verify it against the receipt.

## 6. Market Cache Migration

The existing SQLite market cache is rebuildable and is not imported. `SqliteMarketDataCache` is replaced by a PostgreSQL implementation with equivalent semantics:

- cache identity includes resource type, normalized request and provider;
- only schema-valid successful values replace the last success;
- stale fallback and provider cooldown behavior remain unchanged;
- compare-and-set prevents an older concurrent response from overwriting a newer value;
- TTLs remain those documented in README unless a provider contract requires a separate value.

The `market` schema also stores refresh attempts and provider cooldowns so all workers observe the same state.

## 7. Failure and Recovery

- PostgreSQL unavailable: mutating UI is disabled, cached read views may remain visible as stale, and no browser-local shadow write is created.
- Redis unavailable: synchronous business commands continue if their transaction commits; Outbox rows remain pending until Redis recovers.
- Invalid local record: quarantine it in the backup and exclude it from import; valid siblings remain eligible.
- Import process interruption: the transaction rolls back; the same document hash can be retried.
- API response lost after commit: retrying the same idempotency key returns the stored response.
- Schema mismatch on restore: restore stops before replacing the active database.

## 8. Docker and Operations

Compose defines health checks and named volumes for PostgreSQL and Redis. `web-api` waits for PostgreSQL migrations before accepting traffic. Workers do not start until API, PostgreSQL and Redis are healthy.

Backup creates a timestamped custom-format dump plus a JSON manifest containing application version, database migration version and checksum. Restore validates the manifest, requires worker containers to be stopped, restores into a temporary database, runs integrity checks, then switches databases.

## 9. Testing and Completion Criteria

- Repository contract tests run the same behavioral suite against in-memory fakes and PostgreSQL repositories.
- Integration tests verify transactions, unique constraints, numeric precision, optimistic concurrency and Outbox/Inbox behavior with real PostgreSQL/Redis.
- Migration tests cover every recognized key, corrupt siblings, preserved IDs/timestamps, empty target, non-empty conflict, lost response retry and hash mismatch.
- Browser E2E seeds legacy localStorage, previews and imports it, restarts Compose, reloads the production page and verifies all domains and immutable histories.
- Production source scan finds no direct import of browser business repositories.
- Existing unit, market-data, monitoring, portfolio, performance and Chrome flows remain green.

Milestone 1 is complete only when the production application can start from an empty PostgreSQL database, import the full existing browser state exactly once, survive container restart, create new records exclusively on the server and restore a verified backup.

## 10. Non-Goals

- User registration, sessions, passwords or remote access.
- Automatic conflict merging between a non-empty server and browser backup.
- Importing derived performance or request caches.
- Multi-device synchronization.
