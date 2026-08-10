import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import type { ConditionDraft, ConditionEvaluation, ThesisCondition } from "./domain";
import type { Thesis, ThesisDraft } from "../../../shared/thesis";
import { ResearchMonitorPanel } from "./ResearchMonitorPanel";

const client = { getQuotes: vi.fn(), getUniverse: vi.fn(), getEvents: vi.fn() };
function state(seed?: { thesis?: Thesis; conditions?: ThesisCondition[]; evaluations?: Record<string, ConditionEvaluation[]> }) {
  const theses: Thesis[] = seed?.thesis ? [seed.thesis] : []; const conditions = [...(seed?.conditions ?? [])];
  const thesisService = {
    listLatest: async () => theses, getLatest: async (symbol: string) => theses.filter((item) => item.symbol === symbol).at(-1), getHistory: async () => theses,
    create: vi.fn(async (draft: ThesisDraft) => { const thesis = { ...draft, symbol: draft.symbol.toUpperCase(), id: `thesis-${theses.length + 1}`, version: theses.length + 1, createdAt: "2026-08-10T10:00:00.000Z" }; theses.push(thesis); return thesis; }),
    listConditions: async (id: string) => conditions.filter((item) => item.thesisVersionId === id && !item.deletedAt),
    createConditions: vi.fn(async (input: { symbol: string; thesisVersionId: string; conditions: ConditionDraft[] }) => { const saved = input.conditions.map((draft) => ({ ...draft, symbol: input.symbol, thesisVersionId: input.thesisVersionId, conditionVersion: "deadbeef", createdAt: "2026-08-10T10:00:00.000Z", updatedAt: "2026-08-10T10:00:00.000Z" } as ThesisCondition)); conditions.push(...saved); return saved; }),
    softDeleteCondition: vi.fn(async (id: string) => conditions.find((item) => item.id === id)!), copyConditions: vi.fn(async () => []),
  };
  const monitorState = { listEvaluations: async (id: string) => seed?.evaluations?.[id] ?? [], recordEvaluation: vi.fn(), listAlerts: vi.fn(async () => []), getAlert: vi.fn(), recordAlert: vi.fn(), act: vi.fn(), listAlertActions: vi.fn(async () => []), listReviews: vi.fn(async () => []), recordReview: vi.fn() };
  return { thesisService, monitorState, theses, conditions };
}
afterEach(cleanup);

test("saves conditions against the new server thesis id", async () => {
  const user = userEvent.setup(); const onThesisSaved = vi.fn(); const fixture = state();
  render(<ResearchMonitorPanel symbol="NVDA" marketClient={client as never} onThesisSaved={onThesisSaved} thesisService={fixture.thesisService} monitorState={fixture.monitorState as never} />);
  await user.click(screen.getByRole("button", { name: "添加风险条件" })); await user.clear(screen.getByLabelText("目标值")); await user.type(screen.getByLabelText("目标值"), "180"); await user.click(screen.getByRole("button", { name: "保存投资逻辑" }));
  await waitFor(() => expect(fixture.thesisService.createConditions).toHaveBeenCalledWith(expect.objectContaining({ thesisVersionId: "thesis-1", conditions: [expect.objectContaining({ target: 180 })] })));
  expect(onThesisSaved).toHaveBeenCalledWith("thesis-1");
});
test("loads the latest persisted evaluation asynchronously", async () => {
  const thesis: Thesis = { id: "thesis-1", symbol: "NVDA", version: 1, coreJudgment: "增长", evidence: ["收入"], risks: ["估值"], validationConditions: ["财报"], createdAt: "2026-08-10T09:00:00.000Z" };
  const condition = { id: "condition-1", symbol: "NVDA", thesisVersionId: thesis.id, kind: "metric", name: "估值风险", direction: "risk", severity: "high", metric: "price", operator: ">=", target: 180, period: "CURRENT", conditionVersion: "deadbeef", createdAt: thesis.createdAt, updatedAt: thesis.createdAt } as ThesisCondition;
  const evaluation = { id: "evaluation-1", conditionId: condition.id, conditionVersion: "deadbeef", status: "confirmed", dataState: "stale", explanation: "旧缓存，保留上次有效结论", evaluatedAt: "2026-08-10T10:00:00.000Z", changed: false } as ConditionEvaluation;
  const fixture = state({ thesis, conditions: [condition], evaluations: { [condition.id]: [evaluation] } });
  render(<ResearchMonitorPanel symbol="NVDA" marketClient={client as never} onThesisSaved={() => undefined} thesisService={fixture.thesisService} monitorState={fixture.monitorState as never} />);
  expect(await screen.findByText("成立")).toBeVisible(); expect(screen.getByText("旧缓存，保留上次有效结论")).toBeVisible();
});
