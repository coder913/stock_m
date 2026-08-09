import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ConditionRepository } from "./conditionRepository";
import { EvaluationRepository } from "./evaluationRepository";
import { LocalThesisRepository } from "../thesis/localThesisRepository";
import { ResearchMonitorPanel } from "./ResearchMonitorPanel";

const envelope = <T,>(data: T) => ({ data, source: "alpaca" as const, asOf: "2026-08-09T10:00:00Z", fetchedAt: "2026-08-09T10:00:00Z", expiresAt: "2026-08-09T10:01:00Z", stale: false, notices: [] });
const client = {
  getQuotes: async () => envelope([{ symbol: "NVDA", price: 167.32, previousClose: 165, currency: "USD", marketSession: "regular" as const }]),
  getUniverse: async () => envelope({ version: "fixture", generatedAt: "2026-08-09T10:00:00Z", items: [] }),
  getEvents: async () => envelope([]),
};

beforeEach(() => localStorage.clear());
afterEach(cleanup);

test("saves conditions against the new thesis id", async () => {
  const user = userEvent.setup();
  const onThesisSaved = vi.fn();
  render(<ResearchMonitorPanel symbol="NVDA" marketClient={client} onThesisSaved={onThesisSaved} />);

  await user.click(screen.getByRole("button", { name: "添加风险条件" }));
  await user.clear(screen.getByLabelText("目标值"));
  await user.type(screen.getByLabelText("目标值"), "180");
  await user.click(screen.getByRole("button", { name: "保存投资逻辑" }));

  const saved = new ConditionRepository(localStorage).listActive();
  expect(saved).toEqual([expect.objectContaining({ thesisVersionId: expect.any(String), symbol: "NVDA", target: 180 })]);
  expect(onThesisSaved).toHaveBeenCalledWith(saved[0].thesisVersionId);
  expect(await screen.findByText("成立")).toBeVisible();
});

test("shows a stale evaluation without changing the previous status", () => {
  const thesis = new LocalThesisRepository(localStorage).save({ symbol: "NVDA", coreJudgment: "增长", evidence: ["收入"], risks: ["估值"], validationConditions: ["旧文本"] }, "2026-08-09T09:00:00Z");
  const condition = new ConditionRepository(localStorage).saveForThesis({ symbol: "NVDA", thesisVersionId: thesis.id, conditions: [{ id: "condition-1", kind: "metric", name: "估值风险", direction: "risk", severity: "high", metric: "price", operator: ">=", target: 180, period: "CURRENT" }], now: "2026-08-09T09:00:00Z" })[0];
  new EvaluationRepository(localStorage).append({ id: "evaluation-1", conditionId: condition.id, conditionVersion: condition.conditionVersion!, status: "confirmed", dataState: "stale", actualValue: 190, targetValue: 180, source: "alpaca", asOf: "2026-08-09T10:00:00Z", explanation: "旧缓存，保留上次有效结论", evaluatedAt: "2026-08-09T10:01:00Z", changed: false, previousStatus: "confirmed" });

  render(<ResearchMonitorPanel symbol="NVDA" marketClient={client} onThesisSaved={() => undefined} />);
  expect(screen.getByText("成立")).toBeVisible();
  expect(screen.getByText("旧缓存，保留上次有效结论")).toBeVisible();
});

test("evaluates an existing thesis on first load and shows recovery warnings", async () => {
  const thesisRepository = new LocalThesisRepository(localStorage);
  const thesis = thesisRepository.save({ symbol: "NVDA", coreJudgment: "增长", evidence: ["收入"], risks: ["估值"], validationConditions: ["旧文本"] }, "2026-08-09T09:00:00Z");
  const service = { evaluate: vi.fn().mockResolvedValue({ conditions: [], alertsCreated: 0, warnings: ["skipped one corrupt condition"] }), getConditionView: vi.fn().mockReturnValue([]) };

  render(<ResearchMonitorPanel symbol="NVDA" marketClient={client} onThesisSaved={() => undefined} thesisRepository={thesisRepository} monitorService={service as never} />);

  await waitFor(() => expect(service.evaluate).toHaveBeenCalledWith({ symbols: ["NVDA"], now: expect.any(String) }));
  expect(await screen.findByText("skipped one corrupt condition")).toBeVisible();
  expect(service.getConditionView).toHaveBeenCalledWith(thesis.id);
});

test("copies saved conditions into a new immutable thesis version", async () => {
  const user = userEvent.setup();
  const thesisRepository = new LocalThesisRepository(localStorage);
  const conditionRepository = new ConditionRepository(localStorage);
  const first = thesisRepository.save({ symbol: "NVDA", coreJudgment: "增长", evidence: ["收入"], risks: ["估值"], validationConditions: ["财报"] }, "2026-08-09T09:00:00Z");
  const oldCondition = conditionRepository.saveForThesis({ symbol: "NVDA", thesisVersionId: first.id, conditions: [{ id: "condition-v1", kind: "metric", name: "估值风险", direction: "risk", severity: "high", metric: "price", operator: ">=", target: 180, period: "CURRENT" }], now: "2026-08-09T09:00:00Z" })[0];
  const service = { evaluate: vi.fn().mockResolvedValue({ conditions: [], alertsCreated: 0, warnings: [] }), getConditionView: vi.fn((id: string) => conditionRepository.listForThesis(id).map((condition) => ({ condition }))) };
  render(<ResearchMonitorPanel symbol="NVDA" marketClient={client} onThesisSaved={() => undefined} thesisRepository={thesisRepository} conditionRepository={conditionRepository} monitorService={service as never} />);

  await user.click(await screen.findByRole("button", { name: "基于当前条件新建版本" }));
  await user.clear(screen.getByLabelText("目标值"));
  await user.type(screen.getByLabelText("目标值"), "200");
  await user.click(screen.getByRole("button", { name: "保存投资逻辑" }));

  await waitFor(() => expect(thesisRepository.getHistory("NVDA")).toHaveLength(2));
  const latest = thesisRepository.getLatest("NVDA")!;
  const latestConditions = conditionRepository.listForThesis(latest.id);
  expect(conditionRepository.listForThesis(first.id)[0]).toEqual(oldCondition);
  expect(latestConditions).toEqual([expect.objectContaining({ target: 200 })]);
  expect(latestConditions[0].id).not.toBe(oldCondition.id);
});
