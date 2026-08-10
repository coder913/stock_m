// @vitest-environment node
import { expect, test, vi } from "vitest";
import type { Transaction } from "kysely";
import { buildApp } from "../app";
import type { Database } from "../db/types";
import type { StoredHttpResponse } from "../platform/idempotencyRepository";
import type { MonitorStateRouteDependencies } from "./monitorStateRoutes";

function dependencies() {
  const action = { id: "action-1", alertId: "alert-1", type: "snooze", until: "2026-08-12T00:00:00.000Z", createdAt: "2026-08-10T09:00:00.000Z" };
  const repository = { listEvaluations: vi.fn(async () => []), latestEvaluation: vi.fn(), recordEvaluation: vi.fn(), listAlerts: vi.fn(async () => []), getAlert: vi.fn(), recordAlert: vi.fn(), act: vi.fn(async () => action), listAlertActions: vi.fn(async () => [action]), listReviews: vi.fn(async () => []), latestReview: vi.fn(), recordReview: vi.fn() };
  const outbox = { append: vi.fn(async () => undefined) };
  const database = { transaction: () => ({ execute: (command: (transaction: Transaction<Database>) => Promise<StoredHttpResponse>) => command({} as Transaction<Database>) }) };
  const idempotency = { execute: vi.fn(async (_transaction, _key, _fingerprint, command) => command()) };
  const taskHealth = { get: vi.fn(async () => ({ worker: { state: "ready", queueLag: 3, heartbeatAt: "2026-08-10T09:00:00.000Z" }, groups: [] })) };
  const runs = { enqueue: vi.fn(async () => [{ id: "run-1", type: "price", naturalPeriod: "2026-08-10T10:05-04:00", scheduledFor: "2026-08-10T14:05:00.000Z", catchUp: true, status: "claimed" }]), get: vi.fn(async () => ({ id: "run-1", status: "succeeded" })) };
  return { repository, outbox, database, idempotency, taskHealth, runs };
}

test("appends an alert action through an idempotent command", async () => {
  const state = dependencies();
  const app = buildApp({ config: { host: "127.0.0.1", port: 8787, providers: { alpaca: { configured: false }, sec: { configured: true }, finnhub: { configured: false }, fred: { configured: false } }, publicStatus: { providers: {} } }, cache: { health: async () => ({ writable: true, entries: 0 }) }, monitorState: state as unknown as MonitorStateRouteDependencies });
  const response = await app.inject({ method: "POST", url: "/api/v1/monitor/alerts/alert-1/actions", headers: { "idempotency-key": "alert-action-1" }, payload: { type: "snooze", until: "2026-08-12T00:00:00.000Z" } });
  expect(response.statusCode).toBe(201);
  expect(state.repository.act).toHaveBeenCalledWith("alert-1", { type: "snooze", until: "2026-08-12T00:00:00.000Z" }, expect.anything());
  expect(state.outbox.append).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ topic: "monitor.alert.action.created", aggregateId: "alert-1" }));
  await app.close();
});

test("exposes task health and enqueues one idempotent manual grouped run", async () => {
  const state = dependencies();
  const app = buildApp({ config: { host: "127.0.0.1", port: 8787, providers: { alpaca: { configured: false }, sec: { configured: true }, finnhub: { configured: false }, fred: { configured: false } }, publicStatus: { providers: {} } }, cache: { health: async () => ({ writable: true, entries: 0 }) }, monitorState: state as unknown as MonitorStateRouteDependencies });
  expect((await app.inject({ method: "GET", url: "/api/v1/monitor/task-health" })).json()).toMatchObject({ worker: { state: "ready", queueLag: 3 } });
  const response = await app.inject({ method: "POST", url: "/api/v1/monitor/runs", headers: { "idempotency-key": "manual-run-1" }, payload: {} });
  expect(response.statusCode).toBe(202);
  expect(response.json()).toMatchObject({ runs: [{ id: "run-1", status: "claimed" }] });
  await app.close();
});

test("lists the alert queue with server-side filters", async () => {
  const state = dependencies();
  const app = buildApp({ config: { host: "127.0.0.1", port: 8787, providers: { alpaca: { configured: false }, sec: { configured: true }, finnhub: { configured: false }, fred: { configured: false } }, publicStatus: { providers: {} } }, cache: { health: async () => ({ writable: true, entries: 0 }) }, monitorState: state as unknown as MonitorStateRouteDependencies });
  const response = await app.inject({ method: "GET", url: "/api/v1/monitor/alerts?view=pending&now=2026-08-10T10%3A00%3A00.000Z&symbol=nvda&severity=high" });
  expect(response.statusCode).toBe(200);
  expect(state.repository.listAlerts).toHaveBeenCalledWith(expect.objectContaining({ view: "pending", symbol: "NVDA", severity: "high" }));
  await app.close();
});
