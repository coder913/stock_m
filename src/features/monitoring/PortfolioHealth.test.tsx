import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, test } from "vitest";
import type { ThesisHealthSummary } from "./domain";
import { PortfolioHealth } from "./PortfolioHealth";

afterEach(cleanup);

const summary: ThesisHealthSummary = { breachedCount: 1, expiringCount: 0, unreadAlertCount: 1, items: [{ symbol: "NVDA", thesisVersionId: "thesis-1", status: "review-needed", breachedCount: 1, expiringCount: 0, unreadAlertCount: 1 }] };

test("renders aggregate counts and per-position thesis health", () => {
  render(<MemoryRouter><PortfolioHealth summary={summary} /></MemoryRouter>);
  expect(screen.getByText("受损条件 1")).toBeVisible();
  expect(screen.getByText("7 日内到期 0")).toBeVisible();
  expect(screen.getByText("未读提醒 1")).toBeVisible();
  expect(screen.getByText("需要复核")).toBeVisible();
  expect(screen.getByRole("link", { name: "复核 NVDA" })).toHaveAttribute("href", "/stocks/NVDA");
});

test("labels an unmonitored position explicitly", () => {
  render(<MemoryRouter><PortfolioHealth summary={{ breachedCount: 0, expiringCount: 0, unreadAlertCount: 0, items: [{ symbol: "NVDA", status: "unmonitored", breachedCount: 0, expiringCount: 0, unreadAlertCount: 0 }] }} /></MemoryRouter>);
  expect(screen.getByText("无监控条件")).toBeVisible();
});
