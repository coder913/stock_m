import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, test, vi } from "vitest";
import type { MonitorAlert } from "./domain";
import { MonitorPage } from "./MonitorPage";

const nvda: MonitorAlert = { id: "alert-1", dedupeKey: "key-1", symbol: "NVDA", thesisVersionId: "thesis-nvda", conditionId: "condition-nvda", conditionVersion: "deadbeef", fromStatus: "confirmed", toStatus: "breached", severity: "high", title: "NVDA 估值风险", explanation: "价格突破", createdAt: "2026-08-09T10:01:00.000Z" };
function state() {
  let actions: string[] = [];
  const monitorState = { listAlerts: vi.fn(async (query: { view: string; symbol?: string }) => query.view === "pending" && (!query.symbol || query.symbol === "NVDA") && !actions.includes("archive") ? [{ ...nvda, ...(actions.includes("read") ? { readAt: "2026-08-11T10:00:00.000Z" } : {}) }] : query.view === "archived" && actions.includes("archive") ? [{ ...nvda, archivedAt: "2026-08-11T10:00:00.000Z" }] : []), listEvaluations: vi.fn(async () => []), listReviews: vi.fn(async () => []), act: vi.fn(async (_id: string, action: { type: string }) => { actions.push(action.type); return {}; }), recordReview: vi.fn(async (review) => ({ ...review, id: "review-1" })), getAlert: vi.fn(), recordAlert: vi.fn(), recordEvaluation: vi.fn(), listAlertActions: vi.fn(async () => []) };
  return monitorState;
}
afterEach(cleanup);

test("loads the inbox and records a reaffirmed review through the API", async () => {
  const user = userEvent.setup(); const monitorState = state();
  render(<MemoryRouter><MonitorPage monitorState={monitorState as never} now={() => "2026-08-11T10:00:00.000Z"} /></MemoryRouter>);
  expect(await screen.findByText("NVDA 估值风险")).toBeVisible(); await user.click(screen.getByRole("button", { name: "确认 NVDA 逻辑仍成立" })); await user.type(screen.getByLabelText("复核备注"), "需求趋势未改变"); await user.click(screen.getByRole("button", { name: "保存复核" }));
  await waitFor(() => expect(monitorState.recordReview).toHaveBeenCalledWith(expect.objectContaining({ thesisVersionId: "thesis-nvda", decision: "reaffirmed", note: "需求趋势未改变" })));
});

test("archives an alert without optimistic removal", async () => {
  const user = userEvent.setup(); const monitorState = state();
  render(<MemoryRouter><MonitorPage monitorState={monitorState as never} now={() => "2026-08-11T10:00:00.000Z"} /></MemoryRouter>);
  await user.click(await screen.findByRole("button", { name: "归档 NVDA 估值风险" })); await waitFor(() => expect(screen.queryByText("NVDA 估值风险")).not.toBeInTheDocument()); await user.click(screen.getByRole("tab", { name: "已归档" })); expect(await screen.findByText("NVDA 估值风险")).toBeVisible();
});
