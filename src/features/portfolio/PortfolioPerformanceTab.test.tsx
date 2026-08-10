import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import type { MarketEvent } from "../market/apiDomain";
import type { PerformanceViewModel } from "./performance/domain";
import { PortfolioPerformanceTab } from "./PortfolioPerformanceTab";
import { SplitReviewPanel } from "./SplitReviewPanel";

afterEach(cleanup);

const model = (overrides: Partial<PerformanceViewModel> = {}): PerformanceViewModel => ({
  result: {
    points: [{ marketDate: "2026-08-04", valuedAt: "2026-08-04T20:00:00Z", cash: 1000, holdingsValue: 0, totalValue: 1000, externalFlow: 0, dailyReturn: 0, cumulativeTwr: 0, normalizedPortfolio: 100, benchmarkValue: 100, benchmarkReturn: 0, excessReturn: 0, drawdown: 0, dataState: "fresh", missingSymbols: [] }],
    summary: { from: "2026-08-04", to: "2026-08-04", availableFrom: "2026-08-04", twr: 0, benchmarkReturn: 0, excessReturn: 0, currentDrawdown: 0, maximumDrawdown: 0 },
    dailyInternals: [],
    interval: { beginningValue: 1000, endingValue: 1000, deposits: 0, withdrawals: 0 },
    warnings: [],
  },
  attribution: { items: [], totalMoneyPnl: 0, totalReturnContribution: 0, reconciled: true },
  pendingSplits: [],
  notices: [],
  dataState: "fresh",
  provenance: { source: "alpaca", asOf: "2026-08-04T20:00:00Z", availableFrom: "2026-08-04" },
  ...overrides,
});
const props = () => ({
  model: model(),
  range: { kind: "inception" } as const,
  benchmark: "SPY",
  onRangeChange: vi.fn(),
  onBenchmarkSave: vi.fn().mockResolvedValue(undefined),
  onRefresh: vi.fn(),
  onConfigure: vi.fn(),
  onConfirmSplit: vi.fn(),
  onIgnoreSplit: vi.fn(),
  onManualSplit: vi.fn(),
});

test("switches ranges and saves a valid custom benchmark", async () => {
  const user = userEvent.setup();
  const values = props();
  render(<PortfolioPerformanceTab {...values} />);
  await user.click(screen.getByRole("button", { name: "1 年" }));
  expect(values.onRangeChange).toHaveBeenCalledWith({ kind: "1y" });
  await user.selectOptions(screen.getByLabelText("比较基准"), "custom");
  await user.type(screen.getByLabelText("自定义基准代码"), "xlk");
  await user.click(screen.getByRole("button", { name: "应用基准" }));
  expect(values.onBenchmarkSave).toHaveBeenCalledWith("XLK");
});

test("renders gaps and unavailable metric reasons", () => {
  render(<PortfolioPerformanceTab {...props()} model={model({ result: undefined, attribution: undefined, notices: ["行情区间不连续", "MWR 无法计算：现金流不足"], dataState: "unavailable" })} />);
  expect(screen.getByText("行情区间不连续")).toBeVisible();
  expect(screen.getByText("MWR 无法计算：现金流不足")).toBeVisible();
});

test("keeps the saved benchmark when a custom symbol has no usable history", async () => {
  const user = userEvent.setup();
  const values = props();
  values.onBenchmarkSave.mockRejectedValueOnce(new Error("基准没有有效历史日线"));
  render(<PortfolioPerformanceTab {...values} />);
  await user.selectOptions(screen.getByLabelText("比较基准"), "custom");
  await user.type(screen.getByLabelText("自定义基准代码"), "BAD");
  await user.click(screen.getByRole("button", { name: "应用基准" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("基准没有有效历史日线");
  expect(screen.getByText("SPY", { exact: true })).toBeVisible();
});

test("rejects a reversed custom date range", async () => {
  const user = userEvent.setup();
  const values = props();
  render(<PortfolioPerformanceTab {...values} />);
  await user.click(screen.getByRole("button", { name: "自定义" }));
  await user.type(screen.getByLabelText("开始日期"), "2026-08-10");
  await user.type(screen.getByLabelText("结束日期"), "2026-08-04");
  await user.click(screen.getByRole("button", { name: "应用区间" }));
  expect(screen.getByRole("alert")).toHaveTextContent("开始日期不能晚于结束日期");
  expect(values.onRangeChange).not.toHaveBeenCalled();
});

test("confirms an edited split ratio", async () => {
  const user = userEvent.setup();
  const onConfirm = vi.fn();
  const candidate: MarketEvent = { id: "split", type: "split", symbol: "NVDA", title: "NVDA split", scheduledAt: "2026-08-06", timing: "all-day", source: "alpaca", split: { oldRate: 1, newRate: 2, quantityMultiplier: 2, effectiveDate: "2026-08-06" } };
  render(<SplitReviewPanel candidates={[candidate]} onConfirm={onConfirm} onIgnore={vi.fn()} onManual={vi.fn()} />);
  await user.clear(screen.getByLabelText("新股比例"));
  await user.type(screen.getByLabelText("新股比例"), "4");
  await user.click(screen.getByRole("button", { name: "确认 NVDA 拆股" }));
  expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ oldRate: 1, newRate: 4, quantityMultiplier: 4 }));
});
