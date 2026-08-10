// @vitest-environment node
import { expect, test, vi } from "vitest";
import type { Kysely, Transaction } from "kysely";
import type { Database } from "../db/types";
import type { IdempotencyStore, StoredHttpResponse } from "./idempotencyRepository";
import { withIdempotency } from "./withIdempotency";

function createHarness() {
  const records = new Map<string, { fingerprint: string; response: StoredHttpResponse }>();
  const command = vi.fn(async (): Promise<StoredHttpResponse> => ({ statusCode: 201, body: { id: "created" } }));
  const store: IdempotencyStore = {
    async execute(_transaction, key, fingerprint, execute) {
      const existing = records.get(key);
      if (existing) {
        if (existing.fingerprint !== fingerprint) {
          const error = new Error("conflict") as Error & { code: string };
          error.code = "IDEMPOTENCY_CONFLICT";
          throw error;
        }
        return existing.response;
      }
      const response = await execute();
      records.set(key, { fingerprint, response });
      return response;
    },
  };
  const database = {
    transaction: () => ({
      execute: (callback: (transaction: Transaction<Database>) => Promise<StoredHttpResponse>) =>
        callback({} as Transaction<Database>),
    }),
  } as unknown as Kysely<Database>;

  return {
    command,
    execute: (key: string, body: unknown) => withIdempotency(
      { database, store },
      { key, route: "POST /api/v1/watchlists", body },
      command,
    ),
  };
}

test("replays the original response for the same key and canonical fingerprint", async () => {
  const harness = createHarness();

  const first = await harness.execute("key-1", { symbol: "NVDA", nested: { right: 2, left: 1 } });
  const second = await harness.execute("key-1", { nested: { left: 1, right: 2 }, symbol: "NVDA" });

  expect(second).toEqual(first);
  expect(harness.command).toHaveBeenCalledTimes(1);
});

test("rejects a reused key with another fingerprint", async () => {
  const harness = createHarness();

  await harness.execute("key-1", { symbol: "NVDA" });

  await expect(harness.execute("key-1", { symbol: "AMD" })).rejects.toMatchObject({
    code: "IDEMPOTENCY_CONFLICT",
  });
});
