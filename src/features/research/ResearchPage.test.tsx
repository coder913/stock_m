import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { expect, test } from "vitest";
import { ResearchPage } from "./ResearchPage";

test("shows NVDA research with freshness and evidence", async () => {
  const envelope = <T,>(data: T, source: "alpaca" | "sec" | "finnhub" = "alpaca") => ({ data, source, asOf: "2026-08-07T14:00:00Z", fetchedAt: "2026-08-07T14:00:00Z", expiresAt: "2026-08-07T14:01:00Z", stale: false, notices: [] });
  const client = {
    getCompany: async () => envelope({ symbol: "NVDA", name: "NVIDIA Corp" }, "finnhub"),
    getQuotes: async () => envelope([{ symbol: "NVDA", price: 167.32, previousClose: 165, currency: "USD", marketSession: "regular" }]),
    getFinancials: async () => envelope([], "sec"),
    getFilings: async () => envelope([], "sec"),
    getNews: async () => envelope([]),
    getEvents: async () => envelope([{ id: "dividend", type: "dividend", symbol: "NVDA", title: "NVDA 分红", scheduledAt: "2026-08-20", timing: "all-day", source: "alpaca" }]),
    getUniverse: async () => envelope({ version: "v1", generatedAt: "2026-08-07T14:00:00Z", items: [] }, "alpaca"),
  };
  render(<MemoryRouter initialEntries={["/stocks/NVDA"]}><Routes><Route path="/stocks/:symbol" element={<ResearchPage marketClient={client as never} />} /></Routes></MemoryRouter>);
  expect(await screen.findByRole("heading", { name: /NVDA/ })).toBeVisible();
  expect(screen.getByText("延迟 15 分钟")).toBeVisible();
  expect(await screen.findByText(/NVDA 分红/)).toBeVisible();
});
