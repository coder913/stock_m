import type { Job } from "bullmq";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  createTradingBackgroundLifecycle,
  createTradingJobProcessor,
  type TradingInbox,
} from "./tradingWorker";

function job(name: string, id: string, data: Record<string, unknown>): Job {
  return { name, id, data } as Job;
}

function memoryInbox(): TradingInbox {
  const consumed = new Set<string>();
  return {
    consume: vi.fn(async (eventId, effect) => {
      if (consumed.has(eventId)) return false;
      await effect();
      consumed.add(eventId);
      return true;
    }),
  };
}

describe("trading job Inbox consumption", () => {
  test("runs a successfully consumed BullMQ job only once", async () => {
    const commands = { submit: vi.fn().mockResolvedValue(undefined), cancel: vi.fn(), reconcileFull: vi.fn() };
    const inbox = memoryInbox();
    const process = createTradingJobProcessor(commands, inbox);
    const duplicate = job("broker.order.submit.requested", "event-1", { id: "intent-1" });

    await process(duplicate);
    await process(duplicate);

    expect(commands.submit).toHaveBeenCalledTimes(1);
    expect(inbox.consume).toHaveBeenCalledTimes(2);
  });

  test("does not consume a failed command so BullMQ can retry it", async () => {
    const commands = {
      submit: vi.fn().mockRejectedValueOnce(new Error("temporary outage")).mockResolvedValueOnce(undefined),
      cancel: vi.fn(),
      reconcileFull: vi.fn(),
    };
    const process = createTradingJobProcessor(commands, memoryInbox());
    const retry = job("broker.order.submit.requested", "event-2", { id: "intent-2" });

    await expect(process(retry)).rejects.toThrow("temporary outage");
    await expect(process(retry)).resolves.toBeUndefined();

    expect(commands.submit).toHaveBeenCalledTimes(2);
  });

  test("rejects unsupported jobs before reserving an Inbox event", async () => {
    const inbox = memoryInbox();
    const process = createTradingJobProcessor({ submit: vi.fn(), cancel: vi.fn() }, inbox);

    await expect(process(job("unknown", "event-3", {}))).rejects.toThrow("Unsupported trading job");
    expect(inbox.consume).not.toHaveBeenCalled();
  });
});

describe("trading background lifecycle", () => {
  afterEach(() => vi.useRealTimers());

  test("reports stream health and clears timers while waiting for active reconciliation", async () => {
    vi.useFakeTimers();
    let reportStreamHealth: ((healthy: boolean) => void) | undefined;
    const stopStream = vi.fn().mockResolvedValue(undefined);
    let finishOrders: (() => void) | undefined;
    const reconcileOrders = vi.fn(() => new Promise<void>((resolve) => { finishOrders = resolve; }));
    const reconcileAll = vi.fn().mockResolvedValue(undefined);
    const lifecycle = createTradingBackgroundLifecycle({
      reconcileOrders,
      reconcileAll,
      startStream: (onHealth) => {
        reportStreamHealth = onHealth;
        return { stop: stopStream };
      },
    });

    expect(lifecycle.healthy()).toBe(false);
    reportStreamHealth?.(true);
    expect(lifecycle.healthy()).toBe(true);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(reconcileOrders).toHaveBeenCalledTimes(1);
    const closing = lifecycle.close();
    let closed = false;
    void closing.then(() => { closed = true; });
    await Promise.resolve();
    expect(closed).toBe(false);

    finishOrders?.();
    await closing;
    expect(stopStream).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(reconcileOrders).toHaveBeenCalledTimes(1);
    expect(reconcileAll).not.toHaveBeenCalled();
    await lifecycle.close();
    expect(stopStream).toHaveBeenCalledTimes(1);
  });

  test("degrades after reconciliation failure and recovers after the next success", async () => {
    vi.useFakeTimers();
    let reportStreamHealth: ((healthy: boolean) => void) | undefined;
    const reconcileOrders = vi.fn()
      .mockRejectedValueOnce(new Error("Alpaca unavailable"))
      .mockResolvedValueOnce(undefined);
    const lifecycle = createTradingBackgroundLifecycle({
      reconcileOrders,
      reconcileAll: vi.fn().mockResolvedValue(undefined),
      startStream: (onHealth) => {
        reportStreamHealth = onHealth;
        return { stop: vi.fn().mockResolvedValue(undefined) };
      },
    });
    reportStreamHealth?.(true);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(lifecycle.healthy()).toBe(false);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(lifecycle.healthy()).toBe(true);

    await lifecycle.close();
  });
});
