import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test } from "vitest";
import type { StockSnapshot } from "../discovery/domain";
import { PeerComparison } from "./PeerComparison";

afterEach(cleanup);

const peers: StockSnapshot[] = [
  { symbol: "NVDA", name: "英伟达", industry: "半导体", metrics: { revenueGrowthYoY: 35, forwardPE: 32, operatingMargin: 62 } },
  { symbol: "AMD", name: "超威半导体", industry: "半导体", metrics: { revenueGrowthYoY: 24, forwardPE: 38, operatingMargin: 20 } },
];

test("shows comparable-company metrics with period and source", () => {
  render(<PeerComparison peers={peers} period="TTM" source="stock_m demo dataset" />);
  expect(screen.getByRole("heading", { name: "同业比较" })).toBeVisible();
  expect(screen.getByRole("row", { name: /AMD/ })).toBeVisible();
  expect(screen.getByText("TTM · stock_m demo dataset")).toBeVisible();
});

test("blocks direct comparison when financial periods differ", () => {
  render(<PeerComparison peers={peers} period="mixed" source="stock_m demo dataset" />);
  expect(screen.getByRole("alert")).toHaveTextContent("财务周期不一致");
});

test("lets users remove a comparable company", async () => {
  const user = userEvent.setup();
  render(<PeerComparison peers={peers} period="TTM" source="stock_m demo dataset" />);
  await user.click(screen.getByRole("button", { name: "移除 AMD" }));
  expect(screen.queryByRole("row", { name: /AMD/ })).not.toBeInTheDocument();
});
