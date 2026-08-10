import { expect, test, vi } from "vitest";
import { MonitorApiRepository } from "./monitorApiRepository";

test("encodes alert filters and appends alert actions", async () => {
  const client = { requestJson: vi.fn(async () => []) };
  const repository = new MonitorApiRepository(client as never);
  await repository.listAlerts({ view: "pending", now: "2026-08-10T10:00:00.000Z", symbol: "NVDA", severity: "high" });
  await repository.act("alert-1", { type: "archive" }, "command-1");
  expect(client.requestJson).toHaveBeenNthCalledWith(1, { path: "/monitor/alerts?view=pending&now=2026-08-10T10%3A00%3A00.000Z&symbol=NVDA&severity=high" });
  expect(client.requestJson).toHaveBeenNthCalledWith(2, { method: "POST", path: "/monitor/alerts/alert-1/actions", body: { type: "archive" }, idempotencyKey: "command-1" });
});
