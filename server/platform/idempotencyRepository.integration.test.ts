// @vitest-environment node
import { beforeAll, beforeEach, afterAll, expect, test, vi } from "vitest";
import { createDatabase } from "../db/database";
import { migrateToLatest } from "../db/migrate";
import { IdempotencyRepository } from "./idempotencyRepository";

const database = createDatabase(process.env.TEST_DATABASE_URL ?? "postgresql://stock_m:stock_m@127.0.0.1:55432/stock_m_test");
const repository = new IdempotencyRepository(() => new Date("2026-08-10T00:00:00Z"));

beforeAll(() => migrateToLatest(database));
beforeEach(() => database.deleteFrom("platform.idempotency_record").execute());
afterAll(() => database.destroy());

test("stores a deterministic response and replays it without rerunning the command", async () => {
  const command = vi.fn(async () => ({ statusCode: 201, body: { id: "watchlist-1" } }));

  const first = await database.transaction().execute((transaction) =>
    repository.execute(transaction, "same-key", "same-fingerprint", command));
  const second = await database.transaction().execute((transaction) =>
    repository.execute(transaction, "same-key", "same-fingerprint", command));

  expect(second).toEqual(first);
  expect(command).toHaveBeenCalledTimes(1);
});

test("stores and replays array responses as JSON", async () => {
  const command = vi.fn(async () => ({ statusCode: 200, body: [{ id: "alert-1" }] }));

  const first = await database.transaction().execute((transaction) =>
    repository.execute(transaction, "array-key", "array-fingerprint", command));
  const replay = await database.transaction().execute((transaction) =>
    repository.execute(transaction, "array-key", "array-fingerprint", command));

  expect(first.body).toEqual([{ id: "alert-1" }]);
  expect(replay).toEqual(first);
  expect(command).toHaveBeenCalledTimes(1);
});

test("rejects the same key when its fingerprint changes", async () => {
  await database.transaction().execute((transaction) =>
    repository.execute(transaction, "conflicting-key", "left", async () => ({ statusCode: 200, body: { ok: true } })));

  await expect(database.transaction().execute((transaction) =>
    repository.execute(transaction, "conflicting-key", "right", async () => ({ statusCode: 200, body: { ok: true } }))))
    .rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", statusCode: 409 });
});

test("does not retain transient server failures", async () => {
  const command = vi
    .fn<() => Promise<{ statusCode: number; body: unknown }>>()
    .mockResolvedValueOnce({ statusCode: 503, body: { code: "UNAVAILABLE" } })
    .mockResolvedValueOnce({ statusCode: 200, body: { ok: true } });

  await database.transaction().execute((transaction) =>
    repository.execute(transaction, "retryable-key", "fingerprint", command));
  const recovered = await database.transaction().execute((transaction) =>
    repository.execute(transaction, "retryable-key", "fingerprint", command));

  expect(recovered.statusCode).toBe(200);
  expect(command).toHaveBeenCalledTimes(2);
});
