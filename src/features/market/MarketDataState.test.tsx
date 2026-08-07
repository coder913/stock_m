import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { MarketDataState } from "./MarketDataState";

test("distinguishes stale delayed data from an unavailable request", () => {
  render(<MarketDataState envelope={{ data: [], source: "alpaca", asOf: "2026-08-07T10:00:00Z", fetchedAt: "2026-08-07T10:00:00Z", expiresAt: "2026-08-07T10:01:00Z", stale: true, delayMinutes: 15, notices: [] }} error={null} onRetry={() => undefined} />);
  expect(screen.getByText("旧缓存")).toBeVisible();
  expect(screen.getByText("延迟 15 分钟")).toBeVisible();
});

test("shows an actionable retry when no usable data exists", () => {
  render(<MarketDataState error={new Error("offline")} onRetry={() => undefined} />);
  expect(screen.getByRole("alert")).toHaveTextContent("数据暂不可用");
  expect(screen.getByRole("button", { name: "重试" })).toBeVisible();
});

test("renders a distinct loading state before the first response", () => {
  render(<MarketDataState error={null} loading onRetry={() => undefined} />);
  expect(screen.getByRole("status")).toHaveTextContent("正在加载");
});
