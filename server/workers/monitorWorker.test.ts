// @vitest-environment node
import { expect, test } from "vitest";
import { UnrecoverableError, type Job } from "bullmq";
import { InternalSnapshotError } from "../monitoring/internalSnapshotClient";
import { createMonitorJobProcessor } from "./monitorWorker";

function job(name: string, data: unknown) {
  return { name, data } as unknown as Job;
}

test("schedule ticks reconcile while run jobs execute the claimed monitor run", async () => {
  let reconciled = 0;
  const executed: unknown[] = [];
  const process = createMonitorJobProcessor({ reconcile: async () => { reconciled += 1; return []; } }, { run: async (input) => { executed.push(input); return { conditions: [], alertsCreated: 0, warnings: [] }; } });
  await process(job("monitor-schedule-tick", {}));
  await process(job("monitor-run", { id: "run-1" }));
  expect({ reconciled, executed }).toEqual({ reconciled: 1, executed: [{ id: "run-1" }] });
});

test("discards deterministic failures but leaves retryable transport failures retryable", async () => {
  const deterministic = createMonitorJobProcessor({ reconcile: async () => [] }, { run: async () => { throw new InternalSnapshotError("INVALID", "invalid", false, 400); } });
  await expect(deterministic(job("monitor-run", { id: "run-1" }))).rejects.toBeInstanceOf(UnrecoverableError);

  const retryable = createMonitorJobProcessor({ reconcile: async () => [] }, { run: async () => { throw new InternalSnapshotError("DOWN", "down", true, 503); } });
  await expect(retryable(job("monitor-run", { id: "run-2" }))).rejects.toBeInstanceOf(InternalSnapshotError);
});
