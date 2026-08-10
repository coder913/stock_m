# Background Monitoring and Web Push Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evaluate thesis conditions in durable background jobs and deliver one application alert plus at most one successful browser Web Push per subscription while the page is closed.

**Architecture:** BullMQ schedules grouped monitor runs whose natural-period keys are persisted in PostgreSQL. `monitor-worker` calls the internal standardized market API, writes immutable evaluations/alerts with Outbox events, and `notification-worker` consumes those events through Inbox dedupe. A React PWA Service Worker manages opt-in Push subscriptions, notification display and same-origin deep links.

**Tech Stack:** TypeScript, Fastify, PostgreSQL/Kysely, Redis/BullMQ, React, `web-push`, VAPID, `vite-plugin-pwa`, Vitest, Playwright, Docker Compose

## Global Constraints

- Requires the completed server-persistence plan and its PostgreSQL, Outbox, Inbox and repository contracts.
- Use `America/New_York` and the U.S. equity calendar for natural periods.
- Price conditions run every five minutes during regular market hours; financial and event/news groups run once daily.
- Restart catch-up enqueues only the latest required missed group run, never every missed interval.
- Only fresh complete data may change an effective condition conclusion.
- Stale, missing and unavailable data preserve the last fresh conclusion and cannot emit false breach/recovery alerts.
- One condition transition in one natural period creates one alert fact.
- Push is opt-in; rejecting permission never disables application alerts.
- Monitor alerts can deep-link to context but cannot create, confirm or submit orders.
- Email, SMS and per-condition custom schedules are out of scope.

---

### Task 1: Queue Connections, Worker Entrypoints, and Heartbeats

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.env.example`
- Modify: `docker-compose.yml`
- Create: `server/queue/redisConnection.ts`
- Create: `server/queue/queueNames.ts`
- Create: `server/queue/workerHeartbeatRepository.ts`
- Create: `server/queue/workerHeartbeatRepository.integration.test.ts`
- Create: `server/workers/monitorWorker.ts`
- Create: `server/workers/notificationWorker.ts`
- Create: `server/db/migrations/007_worker_heartbeats.ts`
- Modify: `server/config.ts`
- Modify: `server/config.test.ts`

**Interfaces:**
- Produces: `createRedisConnection`, queue constants, graceful worker lifecycle and PostgreSQL heartbeat records.
- Consumes: `ServerConfig.redisUrl`, database factory and platform Inbox/Outbox from persistence milestone.

- [x] **Step 1: Write failing worker configuration and heartbeat tests**

```ts
test("heartbeat reports queue lag without exposing redis credentials", async () => {
  await heartbeats.record({ worker: "monitor", state: "ready", queueLag: 3, at: now });
  expect(await heartbeats.latest("monitor")).toMatchObject({ state: "ready", queueLag: 3 });
});
```

Also assert independent `MONITOR_WORKER_CONCURRENCY` and `NOTIFICATION_WORKER_CONCURRENCY` defaults of 1.

- [x] **Step 2: Run tests and verify RED**

Run: `npm test -- server/config.test.ts`  
Run: `npm run test:integration -- server/queue`  
Expected: FAIL.

- [x] **Step 3: Implement Redis factory and worker lifecycle**

```ts
export const queueNames = {
  monitorRuns: "monitor-runs",
  notifications: "notifications",
} as const;

export function createRedisConnection(redisUrl: string) {
  return new IORedis(redisUrl, { maxRetriesPerRequest: null, enableReadyCheck: true });
}
```

Add `"worker:monitor": "tsx server/workers/monitorWorker.ts"` and `"worker:notifications": "tsx server/workers/notificationWorker.ts"` to `package.json`.

Worker entrypoints migrate/check the database, wait for Redis, record `starting/ready/degraded/stopping` heartbeats, and close queues/connections on SIGTERM.

- [x] **Step 4: Add Compose worker services**

`monitor-worker` and `notification-worker` use the same image with distinct npm commands, no published ports, health checks based on heartbeat freshness and `depends_on` healthy API/PostgreSQL/Redis.

- [x] **Step 5: Run integration/build checks**

Run: `npm run test:integration -- server/queue`  
Run: `npm run build`  
Expected: PASS.

- [x] **Step 6: Commit Task 1**

```bash
git add package.json package-lock.json .env.example docker-compose.yml server/config* server/queue server/workers server/db/migrations/007_worker_heartbeats.ts
git commit -m "feat: bootstrap background workers"
```

### Task 2: Deterministic Schedule Domain and Startup Catch-Up

**Files:**
- Create: `server/monitoring/scheduleDomain.ts`
- Create: `server/monitoring/scheduleDomain.test.ts`
- Create: `server/monitoring/monitorScheduleRepository.ts`
- Create: `server/monitoring/monitorScheduleRepository.integration.test.ts`
- Create: `server/monitoring/monitorScheduler.ts`
- Create: `server/monitoring/monitorScheduler.integration.test.ts`
- Create: `server/db/migrations/008_monitor_schedules.ts`

**Interfaces:**
- Produces: `requiredRunPeriods(now, marketCalendar, lastSuccess)` and BullMQ schedule reconciliation.
- Produces: unique `(runType,naturalPeriod)` monitor run claims.

- [x] **Step 1: Write failing natural-period tests**

```ts
expect(requiredRunPeriods("2026-08-10T14:07:00Z", openCalendar, state)).toContainEqual({ type: "price", naturalPeriod: "2026-08-10T10:05-04:00" });
expect(requiredRunPeriods("2026-11-02T15:07:00Z", dstCalendar, state)).toContainEqual({ type: "price", naturalPeriod: "2026-11-02T10:05-05:00" });
expect(requiredRunPeriods(holidayNoon, closedCalendar, state)).not.toContainEqual(expect.objectContaining({ type: "price" }));
```

Cover DST boundaries, holidays, pre/post market, daily 18:00/18:15 ET and worker restart after multiple missed intervals.

- [x] **Step 2: Run unit tests and verify RED**

Run: `npm test -- server/monitoring/scheduleDomain.test.ts`  
Expected: FAIL.

- [x] **Step 3: Implement pure schedule functions**

```ts
export type MonitorRunType = "price" | "financial" | "event";
export interface RequiredRun { type: MonitorRunType; naturalPeriod: string; scheduledFor: string; catchUp: boolean; }
export interface MarketScheduleCalendar {
  toMarketTime(iso: string): string;
  isRegularSession(marketIso: string): boolean;
  currentFiveMinutePriceRun(marketIso: string): RequiredRun;
  latestDueDailyRun(type: "financial" | "event", marketIso: string, dueTime: "18:00" | "18:15"): Omit<RequiredRun, "catchUp"> | undefined;
}
export interface ScheduleInput { now: string; calendar: MarketScheduleCalendar; lastSuccess: Partial<Record<MonitorRunType, string>>; }

export function requiredRunPeriods(input: ScheduleInput): RequiredRun[] {
  const runs: RequiredRun[] = [];
  const marketNow = input.calendar.toMarketTime(input.now);
  if (input.calendar.isRegularSession(marketNow)) runs.push(input.calendar.currentFiveMinutePriceRun(marketNow));
  const financial = input.calendar.latestDueDailyRun("financial", marketNow, "18:00");
  const event = input.calendar.latestDueDailyRun("event", marketNow, "18:15");
  if (financial && financial.naturalPeriod !== input.lastSuccess.financial) runs.push({ ...financial, catchUp: financial.scheduledFor < input.now });
  if (event && event.naturalPeriod !== input.lastSuccess.event) runs.push({ ...event, catchUp: event.scheduledFor < input.now });
  return runs;
}
```

Implement the comments as explicit Temporal/date-time calculations using the existing market calendar response; do not use the host machine timezone.

- [x] **Step 4: Add schedule/run tables and claims**

Create `monitor.schedule_state` and `monitor.run`. `monitor.run` has unique `(run_type,natural_period)`, scheduled/start/finish timestamps, `fresh|stale|unavailable` aggregate state and diagnostics JSON.

- [x] **Step 5: Reconcile BullMQ schedules and catch-up**

At startup create repeatable tick jobs, compute required catch-up, and enqueue grouped run jobs with `jobId=monitor:<type>:<naturalPeriod>`. Competing startup instances must converge on one PostgreSQL run claim.

- [x] **Step 6: Run unit and real Redis/PostgreSQL tests**

Run: `npm test -- server/monitoring/scheduleDomain.test.ts`  
Run: `npm run test:integration -- server/monitoring/monitorScheduler.integration.test.ts`  
Expected: PASS.

- [x] **Step 7: Commit Task 2**

```bash
git add server/monitoring/scheduleDomain* server/monitoring/monitorScheduleRepository* server/monitoring/monitorScheduler* server/db/migrations/008_monitor_schedules.ts
git commit -m "feat: schedule deterministic monitor runs"
```

### Task 3: Internal Snapshot API and Server-Side Monitor Runner

**Files:**
- Create: `server/routes/internalSnapshotRoutes.ts`
- Create: `server/routes/internalSnapshotRoutes.test.ts`
- Create: `server/monitoring/internalSnapshotClient.ts`
- Create: `server/monitoring/internalSnapshotClient.test.ts`
- Create: `server/monitoring/monitorRunService.ts`
- Create: `server/monitoring/monitorRunService.test.ts`
- Create: `server/monitoring/monitorRunService.integration.test.ts`
- Modify: `server/app.ts`
- Modify: `server/index.ts`
- Modify: `server/workers/monitorWorker.ts`
- Create: `shared/monitoring/conditionEvaluator.ts`
- Create: `shared/monitoring/conditionEvaluator.test.ts`
- Modify: `shared/monitoring.ts`
- Modify: `src/features/monitoring/conditionEvaluator.ts`
- Modify: `src/features/monitoring/conditionEvaluator.test.ts`

**Interfaces:**
- Consumes: active latest thesis conditions from PostgreSQL and standardized market snapshots from API.
- Produces: immutable evaluations, effective-state projection and alert Outbox events.

- [x] **Step 1: Write failing freshness-preservation tests**

```ts
await service.run(freshBreachedRun);
await service.run(staleRecoveredRun);
expect((await repository.latestEffective(condition.id)).status).toBe("breached");
expect((await repository.listAlerts()).filter((alert) => alert.toStatus === "confirmed")).toHaveLength(0);
```

Cover fresh transition, stale/missing/unavailable preservation, condition-version isolation, batch symbol loading and one alert per natural period.

- [x] **Step 2: Run service tests and verify RED**

Run: `npm test -- server/monitoring/monitorRunService.test.ts server/routes/internalSnapshotRoutes.test.ts`  
Expected: FAIL.

- [x] **Step 3: Implement authenticated internal snapshot endpoint**

`POST /internal/v1/monitor-snapshots` accepts symbols and required metrics/events, requires the exact internal service bearer token, and returns the existing `MonitorSnapshot` contract plus aggregate provenance. Do not expose this route through public navigation or CORS.

Register the internal route in `buildApp`; construct its market snapshot dependencies and service-token guard in `server/index.ts`.

Move the pure evaluator into `shared/monitoring/conditionEvaluator.ts`, import transport/domain types from `shared/monitoring.ts`, and temporarily re-export the function from the old feature path so existing browser tests remain compatible. Both server and browser tests run the same shared evaluator cases.

- [x] **Step 4: Implement the run transaction**

```ts
export async function executeMonitorRun(input: ClaimedMonitorRun): Promise<MonitorRunResult> {
  const conditions = await conditionRepository.listActiveForRun(input.type);
  const snapshots = await snapshotClient.load(batchRequirements(conditions));
  const evaluations = conditions.map((condition) => evaluateCondition(condition, snapshots[condition.symbol], input.evaluatedAt));
  return monitorRepository.commitRun(input, evaluations, deriveAlertTransitions(evaluations));
}
```

`commitRun` writes evaluations, effective-state projection, unique alerts and `monitor.alert.created` Outbox events in one transaction.

- [x] **Step 5: Wire BullMQ processing**

Monitor Worker claims the PostgreSQL run, executes it, records aggregate data state and marks success/failure. Retry only retryable gateway/transport failures; deterministic validation errors close the run as failed without infinite retries.

- [x] **Step 6: Run unit/integration tests**

Run: `npm test -- server/monitoring server/routes/internalSnapshotRoutes.test.ts`  
Run: `npm run test:integration -- server/monitoring/monitorRunService.integration.test.ts`  
Expected: PASS.

- [x] **Step 7: Commit Task 3**

```bash
git add server/routes/internalSnapshotRoutes* server/monitoring server/app.ts server/index.ts server/workers/monitorWorker.ts shared/monitoring src/features/monitoring/conditionEvaluator*
git commit -m "feat: evaluate monitors in background"
```

### Task 4: Server Alert Actions and Monitoring UI Cutover

**Files:**
- Modify: `server/routes/monitorStateRoutes.ts`
- Modify: `server/routes/monitorStateRoutes.test.ts`
- Modify: `src/features/monitoring/monitorApiRepository.ts`
- Modify: `src/features/monitoring/MonitorPage.tsx`
- Modify: `src/features/monitoring/ReviewQueue.tsx`
- Modify: `src/features/monitoring/ResearchMonitorPanel.tsx`
- Modify: `src/features/today/TodayPage.tsx`
- Modify: `src/features/monitoring/PortfolioHealth.tsx`
- Create: `src/features/monitoring/MonitorTaskHealth.tsx`
- Create: `src/features/monitoring/MonitorTaskHealth.test.tsx`

**Interfaces:**
- Produces: common server views for current effective conditions, alert facts/actions, monitor timeline and task health.

- [x] **Step 1: Add failing route/component tests**

Assert read/snooze/archive actions append once under idempotent retry, Today/Research/Monitor see the same derived state, and task health renders last success, next run and queue delay.

- [x] **Step 2: Run focused tests and verify RED**

Run: `npm test -- server/routes/monitorStateRoutes.test.ts src/features/monitoring src/features/today`  
Expected: FAIL for missing task health/actions.

- [x] **Step 3: Extend monitor API views and action commands**

Expose `/api/v1/monitor/task-health`, effective condition views, alert timeline, and `POST /alerts/:id/actions` with `{type:"read"|"snooze"|"archive", until?:string}`. Effective UI state folds immutable actions over alert facts.

- [x] **Step 4: Remove page-triggered evaluation**

Today, Research, Portfolio and Monitor no longer call `ThesisMonitorService.evaluate` during render. “Refresh monitoring” enqueues one manual grouped run and polls its run ID; it cannot execute the evaluator in the browser.

- [x] **Step 5: Render task/data waiting states**

Show last fresh conclusion separately from latest waiting evaluation. Display worker degraded/queue lag without hiding existing alerts.

- [x] **Step 6: Run UI, route and E2E regression tests**

Run: `npm test -- src/features/monitoring src/features/today src/features/research src/features/portfolio server/routes/monitorStateRoutes.test.ts`  
Expected: PASS.

- [x] **Step 7: Commit Task 4**

```bash
git add server/routes/monitorStateRoutes* src/features/monitoring src/features/today src/features/research src/features/portfolio
git commit -m "feat: read durable monitor results"
```

### Task 5: Push Subscription Schema, Encryption, and API

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.env.example`
- Modify: `server/config.ts`
- Modify: `server/config.test.ts`
- Create: `server/db/migrations/009_push_subscriptions.ts`
- Create: `server/notifications/subscriptionCrypto.ts`
- Create: `server/notifications/subscriptionCrypto.test.ts`
- Create: `server/notifications/pushSubscriptionRepository.ts`
- Create: `server/notifications/pushSubscriptionRepository.integration.test.ts`
- Create: `server/routes/notificationRoutes.ts`
- Create: `server/routes/notificationRoutes.test.ts`
- Modify: `server/app.ts`
- Modify: `server/index.ts`

**Interfaces:**
- Produces: create/revoke/status/test Push APIs and encrypted subscription storage.
- Consumes: `VAPID_*` and `PUSH_SUBSCRIPTION_ENCRYPTION_KEY` server configuration.

- [x] **Step 1: Add failing crypto/repository tests**

```ts
const encrypted = encryptSubscription(subscription, key, fixedNonce);
expect(JSON.stringify(encrypted)).not.toContain(subscription.keys.auth);
expect(decryptSubscription(encrypted, key)).toEqual(subscription);
```

Cover wrong key rejection, endpoint-hash upsert, revoked/invalid state and API responses that omit endpoint keys.

- [x] **Step 2: Run tests and verify RED**

Run: `npm test -- server/notifications server/routes/notificationRoutes.test.ts server/config.test.ts`  
Expected: FAIL.

- [x] **Step 3: Add dependencies and validated configuration**

Add `web-push` and `@types/web-push`. VAPID subject must be `mailto:` or HTTPS. Encryption key decodes to exactly 32 bytes. Missing Push settings yields `notifications.configured=false` rather than server startup failure.

- [x] **Step 4: Implement AES-256-GCM storage**

Store endpoint hash, ciphertext, IV, auth tag, user agent, created/last-seen/revoked/invalid timestamps. Never log plaintext subscriptions.

- [x] **Step 5: Implement subscription routes**

Routes: `GET /api/v1/notifications/status`, `POST /subscriptions`, `DELETE /subscriptions/:endpointHash`, and `POST /test`. All mutations require idempotency. Test notification emits a durable test-delivery command, not a direct HTTP push.

Register these routes only when notification dependencies are supplied; production composition injects configured/unconfigured status without exposing secrets.

- [x] **Step 6: Run tests and commit**

Run: `npm test -- server/notifications server/routes/notificationRoutes.test.ts server/config.test.ts`  
Run: `npm run test:integration -- server/notifications/pushSubscriptionRepository.integration.test.ts`  
Expected: PASS.

```bash
git add package.json package-lock.json .env.example server/config* server/db/migrations/009_push_subscriptions.ts server/notifications server/routes/notificationRoutes* server/app.ts server/index.ts
git commit -m "feat: persist encrypted push subscriptions"
```

### Task 6: Notification Worker, Retry Policy, and Dead Letters

**Files:**
- Create: `server/db/migrations/010_notification_deliveries.ts`
- Create: `server/notifications/notificationRepository.ts`
- Create: `server/notifications/notificationRepository.integration.test.ts`
- Create: `server/notifications/pushProvider.ts`
- Create: `server/notifications/pushProvider.test.ts`
- Create: `server/notifications/notificationService.ts`
- Create: `server/notifications/notificationService.test.ts`
- Modify: `server/workers/notificationWorker.ts`

**Interfaces:**
- Consumes: `monitor.alert.created` Outbox events and test-delivery commands.
- Produces: one delivery per `(alertId,subscriptionId)`, bounded retries and dead-letter records.

- [ ] **Step 1: Write failing retry/dedupe tests**

```ts
expect(classifyPushFailure({ statusCode: 410 })).toEqual({ action: "invalidate" });
expect(classifyPushFailure({ statusCode: 503 })).toEqual({ action: "retry", delaysMs: [60_000, 300_000, 900_000, 3_600_000] });
await service.consume(event);
await service.consume(event);
expect(await repository.countDeliveries(event.alertId)).toBe(1);
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- server/notifications/notificationService.test.ts server/notifications/pushProvider.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Create delivery tables and provider adapter**

Create unique `(alert_id,subscription_id)` deliveries and attempt rows. Payload contains alert ID, symbol, severity, concise title/explanation and relative URL only. Enforce a 3,000-byte JSON limit.

- [ ] **Step 4: Implement Inbox consumption and retry scheduling**

The worker decrypts one active subscription at send time, records each attempt, invalidates `404/410`, retries timeout/`429/5xx` at 1/5/15/60 minutes, then writes `platform.dead_letter`. Successful delivery is terminal.

- [ ] **Step 5: Run real Redis/PostgreSQL recovery tests**

Delete the BullMQ Redis keys after an alert transaction, run Outbox republish, and assert exactly one successful delivery after recovery.

- [ ] **Step 6: Commit Task 6**

```bash
git add server/db/migrations/010_notification_deliveries.ts server/notifications server/workers/notificationWorker.ts
git commit -m "feat: deliver durable web push alerts"
```

### Task 7: PWA Service Worker and Notification Settings

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `vite.config.ts`
- Create: `src/service-worker.ts`
- Create: `src/features/notifications/notificationApiClient.ts`
- Create: `src/features/notifications/notificationApiClient.test.ts`
- Create: `src/features/notifications/pushSubscription.ts`
- Create: `src/features/notifications/pushSubscription.test.ts`
- Create: `src/features/notifications/NotificationSettings.tsx`
- Create: `src/features/notifications/NotificationSettings.test.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/app/AppShell.tsx`

**Interfaces:**
- Produces: opt-in subscription UX, Service Worker push display and deep-link click behavior.
- Consumes: Task 5 notification API and public VAPID key.

- [ ] **Step 1: Add failing subscription/component tests**

```tsx
render(<NotificationSettings permission="default" api={api} />);
expect(Notification.requestPermission).not.toHaveBeenCalled();
await user.click(screen.getByRole("button", { name: "启用系统通知" }));
expect(Notification.requestPermission).toHaveBeenCalledTimes(1);
```

Cover denied permission, existing subscription, re-subscribe, revoke, test delivery and server-not-configured states.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- src/features/notifications`  
Expected: FAIL.

- [ ] **Step 3: Configure inject-manifest PWA build**

Add `vite-plugin-pwa` with `strategies: "injectManifest"`, `srcDir: "src"`, `filename: "service-worker.ts"`, same-origin scope `/`, and no runtime caching of authenticated/business APIs.

- [ ] **Step 4: Implement Push subscription helpers**

Convert the URL-safe VAPID key to `Uint8Array`, call `registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey})`, and send the serialized subscription through the notification API with endpoint-hash idempotency.

- [ ] **Step 5: Implement Service Worker events**

```ts
self.addEventListener("push", (event) => {
  const payload = event.data?.json() as PushPayload;
  event.waitUntil(self.registration.showNotification(payload.title, { body: payload.explanation, data: { url: payload.url }, tag: `alert:${payload.alertId}` }));
});
```

On `notificationclick`, close the notification, focus/navigate a same-origin existing window or open a new one. Reject absolute/external URLs.

- [ ] **Step 6: Add settings route/navigation and tests**

Expose `/settings/notifications`, status, last success/failure, test, revoke and explanatory copy that Compose/network/browser services must run for page-closed delivery.

- [ ] **Step 7: Run tests/build and commit**

Run: `npm test -- src/features/notifications src/app`  
Run: `npm run build`  
Expected: PASS and `dist/service-worker.js` exists.

```bash
git add package.json package-lock.json vite.config.ts src/service-worker.ts src/features/notifications src/app
git commit -m "feat: add opt-in browser push"
```

### Task 8: Background Notification E2E, Redis Recovery, and Completion

**Files:**
- Create: `server/testing/fakePushProvider.ts`
- Create: `server/testing/deterministicWorkerClock.ts`
- Create: `tests/e2e/background-monitoring-push.spec.ts`
- Modify: `server/testing/e2eServer.ts`
- Modify: `docker-compose.test.yml`
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-08-10-background-monitoring-push.md`

**Interfaces:**
- Produces: deterministic proof of page-closed evaluation, Push delivery/deep link, dedupe and Redis rebuild.

- [ ] **Step 1: Write the failing Chrome flow**

The test enables notifications, registers a fixture subscription, closes the app page, advances the worker clock into a five-minute run, changes the fixture quote to breach a condition, and observes a captured Push payload.

- [ ] **Step 2: Add deep-link and duplicate-delivery assertions**

Dispatch the captured payload through the Service Worker test hook, click the notification, and assert the browser opens `/stocks/NVDA?alert=<id>` with the condition highlighted. Redeliver the same Outbox/BullMQ event and assert one alert and one successful delivery.

- [ ] **Step 3: Add stale/provider and Redis-reset scenarios**

Inject Alpaca `429`, assert latest evaluation waits and the last fresh status remains; flush test Redis, restart workers, assert schedules are rebuilt and no duplicate alert appears.

- [ ] **Step 4: Keep testing controls out of production**

Clock advance, fake Push capture and Redis flush routes/providers are registered only in `server/testing/e2eServer.ts` or Compose test services.

- [ ] **Step 5: Run full validation and scans**

Run: `npm test`  
Run: `npm run test:integration`  
Run: `npm run build`  
Run: `npm run test:e2e`  
Run: `npm run test:data:smoke`  
Run scans for VAPID secrets in `dist`, production fixture imports, production testing routes and browser evaluator calls.  
Expected: all exit 0 and all scan counts are zero.

- [ ] **Step 6: Document and mark completion**

README documents VAPID generation, Compose worker health, permission/revoke/test flow, schedules, catch-up, stale behavior and dead-letter diagnostics. Mark plan checkboxes only after fresh validation.

- [ ] **Step 7: Commit Task 8**

```bash
git add server/testing tests/e2e/background-monitoring-push.spec.ts docker-compose.test.yml README.md docs/superpowers/plans/2026-08-10-background-monitoring-push.md
git commit -m "test: validate background push workflow"
```
