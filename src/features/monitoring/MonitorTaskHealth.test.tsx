import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { MonitorTaskHealth } from "./MonitorTaskHealth";

test("renders worker degradation, queue lag, and each schedule group without hiding prior success", () => {
  render(<MonitorTaskHealth health={{ worker: { state: "degraded", queueLag: 7, heartbeatAt: "2026-08-10T14:00:00Z" }, groups: [
    { type: "price", lastSuccess: "2026-08-10T10:00-04:00", nextRun: "2026-08-10T14:05:00Z", dataState: "fresh" },
    { type: "financial", lastSuccess: "2026-08-09", nextRun: "2026-08-10T22:00:00Z", dataState: "stale" },
  ] }} />);
  expect(screen.getByText("Worker 降级 · 队列积压 7")).toBeVisible();
  expect(screen.getByText(/2026-08-10T10:00-04:00/)).toBeVisible();
  expect(screen.getByText(/等待新数据/)).toBeVisible();
});
