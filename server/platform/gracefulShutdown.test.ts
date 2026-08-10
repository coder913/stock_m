// @vitest-environment node
import { expect, test, vi } from "vitest";
import { createGracefulShutdown } from "./gracefulShutdown";

test("stops accepting requests before draining publishers and connections", async () => {
  const order: string[] = [];
  const shutdown = createGracefulShutdown({
    closeServer: async () => { order.push("server"); },
    stopPublisher: async () => { order.push("publisher"); },
    closeQueue: async () => { order.push("queue"); },
    closeRedis: async () => { order.push("redis"); },
    closeDatabase: async () => { order.push("database"); },
  }, { timeoutMs: 1000, onTimeout: vi.fn() });

  await Promise.all([shutdown(), shutdown()]);

  expect(order).toEqual(["server", "publisher", "queue", "redis", "database"]);
});
