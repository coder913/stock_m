// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { createDatabase } from "../db/database";
import { migrateToLatest } from "../db/migrate";
import { resetTestDatabase } from "../testing/resetTestDatabase";
import { BrokerRepository } from "./brokerRepository";

const database = createDatabase(process.env.TEST_DATABASE_URL ?? "postgresql://stock_m:stock_m@127.0.0.1:55432/stock_m_test");
const now = () => new Date("2026-08-11T14:00:00Z");
const repository = new BrokerRepository(database, now);

beforeAll(() => migrateToLatest(database));
beforeEach(() => resetTestDatabase(database));
afterAll(() => database.destroy());

test("persists immutable intent and rebuilds its current projection from unique events", async () => {
  const intent = await repository.createOrderIntent({
    id: "00000000-0000-4000-8000-000000000001",
    previewId: "00000000-0000-4000-8000-000000000011",
    clientOrderId: "stockm-intent-1",
    symbol: "NVDA",
    side: "buy",
    quantity: "1.500000001",
    type: "limit",
    timeInForce: "day",
    limitPrice: "165.25000000",
  });

  await repository.appendOrderEvent({ intentId: intent.id, remoteEventId: "remote-event-1", event: "remote.accepted", occurredAt: now() });
  await repository.appendOrderEvent({ intentId: intent.id, remoteEventId: "remote-event-1", event: "remote.accepted", occurredAt: now() });

  expect(await repository.getOrderProjection(intent.id)).toMatchObject({
    state: "accepted",
    quantity: "1.500000001",
    limitPrice: "165.25000000",
    version: 1,
  });
  expect(await repository.countOrderEvents(intent.id)).toBe(1);
});

test("deduplicates remote orders, fills, and activities by immutable broker ids", async () => {
  await repository.createOrderIntent({
    id: "00000000-0000-4000-8000-000000000002",
    previewId: "00000000-0000-4000-8000-000000000012",
    clientOrderId: "stockm-intent-2",
    symbol: "NVDA",
    side: "buy",
    quantity: "2.00000000",
    type: "market",
    timeInForce: "day",
  });

  expect(await repository.bindRemoteOrder({ intentId: "00000000-0000-4000-8000-000000000002", remoteOrderId: "alpaca-order-2", raw: { status: "new" } })).toBe(true);
  expect(await repository.bindRemoteOrder({ intentId: "00000000-0000-4000-8000-000000000002", remoteOrderId: "alpaca-order-2", raw: { status: "new" } })).toBe(false);
  expect(await repository.insertFill({ remoteFillId: "fill-2", remoteOrderId: "alpaca-order-2", symbol: "NVDA", side: "buy", quantity: "0.250000001", price: "166.12500000", occurredAt: now(), raw: {} })).toBe(true);
  expect(await repository.insertFill({ remoteFillId: "fill-2", remoteOrderId: "alpaca-order-2", symbol: "NVDA", side: "buy", quantity: "0.250000001", price: "166.12500000", occurredAt: now(), raw: {} })).toBe(false);
  expect(await repository.insertActivity({ remoteActivityId: "activity-2", type: "DIV", symbol: "NVDA", amount: "1.25000000", quantity: "0.000000001", occurredAt: now(), raw: {} })).toBe(true);
  expect(await repository.insertActivity({ remoteActivityId: "activity-2", type: "DIV", symbol: "NVDA", amount: "1.25000000", quantity: "0.000000001", occurredAt: now(), raw: {} })).toBe(false);

  expect(await repository.getFill("fill-2")).toMatchObject({ quantity: "0.250000001", price: "166.12500000" });
  expect(await repository.getActivity("activity-2")).toMatchObject({ amount: "1.25000000", quantity: "0.000000001" });
});

test("stores preview audit metadata without a token and reports active reconciliation drift", async () => {
  await repository.recordPreviewAudit({
    previewId: "00000000-0000-4000-8000-000000000021",
    inputHash: "sha256:preview-21",
    normalizedOrder: { symbol: "NVDA", side: "buy", quantity: "1.00000000", type: "market", timeInForce: "day" },
    expiresAt: new Date("2026-08-11T14:01:00Z"),
  });
  const stored = await database.selectFrom("broker.order_preview_audit").selectAll().executeTakeFirstOrThrow();
  expect(stored.normalizedOrderJson).toMatchObject({ symbol: "NVDA", quantity: "1.00000000" });
  expect(JSON.stringify(stored)).not.toContain("signed-preview");
  expect(await repository.hasActiveDrift()).toBe(false);

  await database.insertInto("broker.reconciliation_run").values({
    id: "00000000-0000-4000-8000-000000000031",
    status: "succeeded",
    diagnosticsJson: JSON.stringify({}),
    startedAt: now(),
    finishedAt: now(),
  }).execute();
  await database.insertInto("broker.drift").values({
    id: "00000000-0000-4000-8000-000000000041",
    reconciliationRunId: "00000000-0000-4000-8000-000000000031",
    cashDifference: "1.00000000",
    symbolDifferencesJson: JSON.stringify([]),
    detectedAt: now(),
    clearedAt: null,
  }).execute();
  expect(await repository.hasActiveDrift()).toBe(true);
});
