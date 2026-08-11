import { expect, test, vi } from "vitest";
import { createWorkerShutdown, workerHeartbeatState } from "./workerRuntime";

test("combines BullMQ and component health and recovers to ready", () => {
  expect(workerHeartbeatState(true, true)).toBe("ready");
  expect(workerHeartbeatState(false, true)).toBe("degraded");
  expect(workerHeartbeatState(true, false)).toBe("degraded");
  expect(workerHeartbeatState(true, true)).toBe("ready");
});

test("runs lifecycle shutdown once before shared runtime resources", async () => {
  const order: string[] = [];
  const shutdown = createWorkerShutdown({
    stopHeartbeat: () => { order.push("heartbeat"); },
    waitForHeartbeat: async () => { order.push("heartbeat-waited"); },
    recordStopping: async () => { order.push("stopping"); },
    closeLifecycle: async () => { order.push("lifecycle"); },
    closeWorker: async () => { order.push("worker"); },
    closeQueue: async () => { order.push("queue"); },
    disconnect: async () => { order.push("redis"); },
    destroyDatabase: async () => { order.push("database"); },
  });

  await Promise.all([shutdown(), shutdown()]);

  expect(order).toEqual(["heartbeat", "heartbeat-waited", "stopping", "lifecycle", "worker", "queue", "redis", "database"]);
  expect(vi.fn()).not.toHaveBeenCalled();
});
