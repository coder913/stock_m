import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, test } from "vitest";
import { ConditionTimeline } from "./ConditionTimeline";
import type { ConditionEvaluation, ThesisReview } from "./domain";
import { MonitorAlertRepository } from "./monitorAlertRepository";
import { ThesisReviewRepository } from "./thesisReviewRepository";
import { MonitorPage } from "./MonitorPage";

beforeEach(() => localStorage.clear());
afterEach(cleanup);

function seedAlerts() {
  const alerts = new MonitorAlertRepository(localStorage);
  alerts.createTransition({ symbol: "NVDA", thesisVersionId: "thesis-nvda", conditionId: "condition-nvda", conditionVersion: "deadbeef", fromStatus: "confirmed", toStatus: "breached", severity: "high", title: "NVDA 估值风险", explanation: "价格突破", asOf: "2026-08-09T10:00:00Z", createdAt: "2026-08-09T10:01:00Z" });
  alerts.createTransition({ symbol: "MSFT", thesisVersionId: "thesis-msft", conditionId: "condition-msft", conditionVersion: "facefeed", fromStatus: "pending", toStatus: "expired", severity: "medium", title: "MSFT 财报验证", explanation: "事件已过期", asOf: "2026-08-10T10:00:00Z", createdAt: "2026-08-10T10:01:00Z" });
  return alerts;
}

test("filters the inbox and records a reaffirmed review", async () => {
  const user = userEvent.setup();
  const alerts = seedAlerts();
  const reviews = new ThesisReviewRepository(localStorage);
  render(<MemoryRouter><MonitorPage alertRepository={alerts} reviewRepository={reviews} now={() => "2026-08-11T10:00:00Z"} /></MemoryRouter>);

  await user.selectOptions(screen.getByLabelText("股票"), "NVDA");
  expect(screen.getByText("NVDA 估值风险")).toBeVisible();
  expect(screen.queryByText("MSFT 财报验证")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "确认 NVDA 逻辑仍成立" }));
  await user.type(screen.getByLabelText("复核备注"), "需求趋势未改变");
  await user.click(screen.getByRole("button", { name: "保存复核" }));
  expect(reviews.latest("thesis-nvda")).toMatchObject({ decision: "reaffirmed", note: "需求趋势未改变" });
});

test("switches between pending, snoozed, and archived repository views", async () => {
  const user = userEvent.setup();
  const alerts = seedAlerts();
  const nvda = alerts.list({ view: "pending", now: "2026-08-11T10:00:00Z", symbol: "NVDA" })[0];
  alerts.snooze(nvda.id, "2026-08-12T00:00:00Z");
  render(<MemoryRouter><MonitorPage alertRepository={alerts} now={() => "2026-08-11T10:00:00Z"} /></MemoryRouter>);

  expect(screen.queryByText("NVDA 估值风险")).not.toBeInTheDocument();
  await user.click(screen.getByRole("tab", { name: "稍后处理" }));
  expect(screen.getByText("NVDA 估值风险")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "归档 NVDA 估值风险" }));
  await user.click(screen.getByRole("tab", { name: "已归档" }));
  expect(screen.getByText("NVDA 估值风险")).toBeVisible();
});

test("shows evaluation and review entries in chronological order", () => {
  const evaluations: ConditionEvaluation[] = [
    { id: "e1", conditionId: "c1", conditionVersion: "v1", status: "confirmed", dataState: "fresh", explanation: "成立", evaluatedAt: "2026-08-09T10:00:00+08:00", changed: true },
    { id: "e2", conditionId: "c1", conditionVersion: "v1", status: "breached", dataState: "fresh", explanation: "受损", evaluatedAt: "2026-08-09T11:00:00+08:00", changed: true },
  ];
  const reviews: ThesisReview[] = [{ id: "r1", thesisVersionId: "t1", symbol: "NVDA", decision: "reaffirmed", conditionSnapshot: [], createdAt: "2026-08-09T12:00:00+08:00" }];
  render(<ConditionTimeline evaluations={evaluations} reviews={reviews} />);
  const entries = screen.getAllByRole("listitem").map((item) => item.textContent);
  expect(entries[0]).toContain("10:00"); expect(entries[0]).toContain("成立");
  expect(entries[1]).toContain("11:00"); expect(entries[1]).toContain("受损");
  expect(entries[2]).toContain("12:00"); expect(entries[2]).toContain("已复核：逻辑仍成立");
});
