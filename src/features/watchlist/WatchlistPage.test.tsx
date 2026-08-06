import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test } from "vitest";
import { WatchlistPage } from "./WatchlistPage";

beforeEach(() => localStorage.clear());
afterEach(cleanup);

test("creates and restores a watchlist group", async () => {
  const user = userEvent.setup();
  render(<WatchlistPage />);
  await user.type(screen.getByLabelText("新分组名称"), "AI 基础设施");
  await user.click(screen.getByRole("button", { name: "创建分组" }));
  await user.click(screen.getByRole("button", { name: "删除 AI 基础设施" }));
  await user.click(screen.getByRole("button", { name: "恢复 AI 基础设施" }));
  expect(screen.getByRole("heading", { name: "AI 基础设施" })).toBeVisible();
});

test("renames a group and removes a symbol", async () => {
  const user = userEvent.setup();
  localStorage.setItem("stock_m:watchlists:v1", JSON.stringify([{ id: "ai", name: "AI", symbols: ["NVDA"], order: 0 }]));
  render(<WatchlistPage />);
  await user.click(screen.getByRole("button", { name: "重命名 AI" }));
  await user.clear(screen.getByLabelText("分组名称"));
  await user.type(screen.getByLabelText("分组名称"), "AI 基础设施");
  await user.click(screen.getByRole("button", { name: "确认重命名" }));
  await user.click(screen.getByRole("button", { name: "移除 NVDA" }));
  expect(screen.getByRole("heading", { name: "AI 基础设施" })).toBeVisible();
  expect(screen.queryByText("NVDA")).not.toBeInTheDocument();
});
