import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, test, vi } from "vitest";
import type { MonitorAlert } from "./domain";
import { ReviewQueue } from "./ReviewQueue";

afterEach(cleanup);

const alert = (overrides: Partial<MonitorAlert> = {}): MonitorAlert => ({ id: "alert-high", dedupeKey: "thesis-1:condition-1:deadbeef:breached:2026-08-09", symbol: "NVDA", thesisVersionId: "thesis-1", conditionId: "condition-1", conditionVersion: "deadbeef", fromStatus: "confirmed", toStatus: "breached", severity: "high", title: "NVDA 估值风险", explanation: "价格突破 180", asOf: "2026-08-09T10:00:00Z", createdAt: "2026-08-09T10:01:00Z", ...overrides });

test("orders high breaches before expiry and supports inbox actions", async () => {
  const user = userEvent.setup();
  const onRead = vi.fn(); const onSnooze = vi.fn(); const onArchive = vi.fn();
  const expired = alert({ id: "alert-expired", symbol: "MSFT", title: "MSFT 财报验证", severity: "medium", toStatus: "expired", createdAt: "2026-08-10T10:01:00Z" });
  render(<MemoryRouter><ReviewQueue alerts={[expired, alert()]} onRead={onRead} onSnooze={onSnooze} onArchive={onArchive} now="2026-08-11T10:00:00Z" /></MemoryRouter>);

  expect(screen.getAllByRole("article")[0]).toHaveTextContent("NVDA 估值风险");
  await user.click(screen.getByRole("button", { name: "标记 NVDA 估值风险为已读" }));
  expect(onRead).toHaveBeenCalledWith("alert-high");
  await user.click(screen.getByRole("button", { name: "稍后处理 NVDA 估值风险" }));
  await user.type(screen.getByLabelText("稍后处理至"), "2026-08-12");
  await user.click(screen.getByRole("button", { name: "确认稍后处理" }));
  expect(onSnooze).toHaveBeenCalledWith("alert-high", "2026-08-12T00:00:00.000Z");
  await user.click(screen.getByRole("button", { name: "归档 NVDA 估值风险" }));
  expect(onArchive).toHaveBeenCalledWith("alert-high");
});

test("requires a future snooze date", async () => {
  const user = userEvent.setup();
  render(<MemoryRouter><ReviewQueue alerts={[alert()]} onRead={() => undefined} onSnooze={() => undefined} onArchive={() => undefined} now="2026-08-12T10:00:00Z" /></MemoryRouter>);
  await user.click(screen.getByRole("button", { name: "稍后处理 NVDA 估值风险" }));
  await user.type(screen.getByLabelText("稍后处理至"), "2026-08-12");
  await user.click(screen.getByRole("button", { name: "确认稍后处理" }));
  expect(screen.getByRole("alert")).toHaveTextContent("请选择未来日期");
});
