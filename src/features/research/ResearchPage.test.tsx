import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, test } from "vitest";
import { ResearchPage } from "./ResearchPage";

const envelope = <T,>(data: T, source: "alpaca" | "sec" | "finnhub" = "alpaca") => ({
  data,
  source,
  asOf: "2026-08-07T14:00:00Z",
  fetchedAt: "2026-08-07T14:00:00Z",
  expiresAt: "2026-08-07T14:01:00Z",
  stale: false,
  notices: [],
});

const baseClient = {
  getCompany: async () => envelope({ symbol: "NVDA", name: "NVIDIA Corp" }, "finnhub"),
  getQuotes: async () => envelope([{ symbol: "NVDA", price: 167.32, previousClose: 165, currency: "USD", marketSession: "regular" }]),
  getBars: async () => envelope([{ symbol: "NVDA", startedAt: "2026-08-06T00:00:00Z", open: 160, high: 168, low: 159, close: 167.32, adjusted: false }]),
  getFinancials: async () => envelope([], "sec"),
  getFilings: async () => envelope([], "sec"),
  getNews: async () => envelope([]),
  getEvents: async () => envelope([{ id: "dividend", type: "dividend", symbol: "NVDA", title: "NVDA 分红", scheduledAt: "2026-08-20", timing: "all-day", source: "alpaca" }]),
  getUniverse: async () => envelope({ version: "v1", generatedAt: "2026-08-07T14:00:00Z", items: [] }, "alpaca"),
};

const renderResearch = (client: object = baseClient) => render(
  <MemoryRouter initialEntries={["/stocks/NVDA"]}>
    <Routes><Route path="/stocks/:symbol" element={<ResearchPage marketClient={client as never} />} /></Routes>
  </MemoryRouter>,
);

afterEach(cleanup);

test("shows live quote and company action", async () => {
  renderResearch();
  expect(await screen.findByRole("heading", { name: /NVDA.*NVIDIA Corp/ })).toBeVisible();
  expect(screen.getByText(/^167\.32 USD/)).toBeVisible();
  expect(await screen.findByText(/NVDA 分红/)).toBeVisible();
});

test("renders price history while financial facts fail independently", async () => {
  renderResearch({
    ...baseClient,
    getBars: async () => envelope([
      { symbol: "NVDA", startedAt: "2026-08-05T00:00:00Z", open: 160, high: 164, low: 159, close: 163, adjusted: false },
      { symbol: "NVDA", startedAt: "2026-08-06T00:00:00Z", open: 163, high: 168, low: 162, close: 167.32, adjusted: false },
    ]),
    getFinancials: async () => { throw new Error("SEC unavailable"); },
    getFilings: async () => envelope([{ symbol: "NVDA", form: "10-K", filedAt: "2026-03-01", accessionNumber: "a", primaryDocument: "nvda.htm", url: "https://example.test/sec/nvda-10k" }], "sec"),
  });

  expect(await screen.findByText(/^167\.32 USD/)).toBeVisible();
  expect(await screen.findByRole("heading", { name: "价格历史" })).toBeVisible();
  expect(screen.getByRole("img", { name: "NVDA 日 K 线" })).toBeVisible();
  expect(screen.getByRole("cell", { name: "167.32" })).toBeVisible();
  expect(screen.getByRole("alert")).toHaveTextContent("财务数据暂时不可用");
  expect(screen.getByRole("link", { name: "查看 10-K 原文" })).toHaveAttribute("href", "https://example.test/sec/nvda-10k");
});
