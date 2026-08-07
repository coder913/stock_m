import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { expect, test } from "vitest";
import { ResearchPage } from "./ResearchPage";

test("requires a saved thesis before paper purchase", async () => {
  localStorage.clear();
  const envelope = <T,>(data: T, source: "alpaca" | "sec" | "finnhub" = "alpaca") => ({ data, source, asOf: "2026-08-07T14:00:00Z", fetchedAt: "2026-08-07T14:00:00Z", expiresAt: "2026-08-07T14:01:00Z", stale: false, notices: [] });
  const client = { getCompany: async () => envelope({ symbol: "NVDA", name: "NVIDIA Corp" }, "finnhub"), getQuotes: async () => envelope([{ symbol: "NVDA", price: 167.32, currency: "USD", marketSession: "regular" }]), getFinancials: async () => envelope([], "sec"), getFilings: async () => envelope([], "sec"), getNews: async () => envelope([]), getEvents: async () => envelope([]), getUniverse: async () => envelope({ version: "v1", generatedAt: "2026-08-07T14:00:00Z", items: [] }) };
  render(<MemoryRouter initialEntries={["/stocks/NVDA"]}><Routes><Route path="/stocks/:symbol" element={<ResearchPage marketClient={client as never} />} /></Routes></MemoryRouter>);
  await screen.findByRole("heading", { name: /NVDA/ });
  expect(screen.getByRole("button", { name: "确认模拟买入" })).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "保存投资逻辑" }));
  expect(screen.getByText("投资逻辑已保存")).toBeVisible();
  expect(screen.getByRole("button", { name: "确认模拟买入" })).toBeEnabled();
});
