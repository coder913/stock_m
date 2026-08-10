import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, test, vi } from "vitest";
import { ResearchPage } from "./ResearchPage";
import { PortfolioLedger } from "../portfolio/portfolioLedger";

const envelope = <T,>(data: T, source: "alpaca" | "sec" | "finnhub" = "alpaca") => ({ data, source, asOf: "2026-08-07T14:00:00Z", fetchedAt: "2026-08-07T14:00:00Z", expiresAt: "2026-08-07T14:01:00Z", stale: false, notices: [] });
const client = { getCompany: async () => envelope({ symbol: "NVDA", name: "NVIDIA Corp" }, "finnhub"), getQuotes: async () => envelope([{ symbol: "NVDA", price: 167.32, currency: "USD", marketSession: "regular" }]), getBars: async () => envelope([]), getFinancials: async () => envelope([], "sec"), getFilings: async () => envelope([], "sec"), getNews: async () => envelope([]), getEvents: async () => envelope([]), getUniverse: async () => envelope({ version: "v1", generatedAt: "2026-08-07T14:00:00Z", items: [] }) };
function services() {
  const created: Array<{ id: string }> = [];
  const thesisService = { listLatest: vi.fn(async () => []), getLatest: vi.fn(async () => undefined), getHistory: vi.fn(async () => []), create: vi.fn(async (draft) => { const thesis = { ...draft, id: "server-thesis-1", version: 1, createdAt: "2026-08-10T10:00:00.000Z" }; created.push(thesis); return thesis; }), listConditions: vi.fn(async () => []), createConditions: vi.fn(async () => []), softDeleteCondition: vi.fn(), copyConditions: vi.fn(async () => []) };
  const monitorState = { listEvaluations: vi.fn(async () => []), recordEvaluation: vi.fn(), listAlerts: vi.fn(async () => []), getAlert: vi.fn(), recordAlert: vi.fn(), act: vi.fn(), listAlertActions: vi.fn(async () => []), listReviews: vi.fn(async () => []), recordReview: vi.fn() };
  return { thesisService, monitorState, created };
}
function renderResearch(state: ReturnType<typeof services>) { return render(<MemoryRouter initialEntries={["/stocks/NVDA"]}><Routes><Route path="/stocks/:symbol" element={<ResearchPage marketClient={client as never} thesisService={state.thesisService as never} monitorState={state.monitorState as never} />} /></Routes></MemoryRouter>); }
afterEach(cleanup);

test("requires a saved thesis before paper purchase", async () => {
  localStorage.clear(); const state = services(); renderResearch(state); await screen.findByRole("heading", { name: /NVDA/ });
  expect(screen.getByRole("button", { name: "确认模拟买入" })).toBeDisabled(); await userEvent.click(screen.getByRole("button", { name: "保存投资逻辑" })); expect(await screen.findByText("投资逻辑已保存")).toBeVisible(); expect(screen.getByRole("button", { name: "确认模拟买入" })).toBeEnabled();
});

test("uses the immutable server thesis id for paper purchase", async () => {
  localStorage.clear(); const state = services(); const user = userEvent.setup(); renderResearch(state); await screen.findByRole("heading", { name: /NVDA/ });
  await user.click(screen.getByRole("button", { name: "添加风险条件" })); await user.clear(screen.getByLabelText("目标值")); await user.type(screen.getByLabelText("目标值"), "180"); await user.click(screen.getByRole("button", { name: "保存投资逻辑" })); await screen.findByText("投资逻辑已保存"); await user.click(screen.getByRole("button", { name: "确认模拟买入" }));
  expect(state.thesisService.createConditions).toHaveBeenCalledWith(expect.objectContaining({ thesisVersionId: "server-thesis-1" })); expect(new PortfolioLedger(localStorage).list()[0].thesisVersionId).toBe("server-thesis-1");
});
