import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { WatchlistPage } from "./WatchlistPage";
import { WatchlistRepository } from "./watchlistRepository";

beforeEach(() => localStorage.clear());
afterEach(cleanup);

const asyncRepository = () => {
  const local = new WatchlistRepository(localStorage);
  return {
    list: async () => local.list(), listDeleted: async () => local.listDeleted(),
    createGroup: async (name: string) => local.createGroup(name),
    renameGroup: async (id: string, name: string) => local.renameGroup(id, name),
    addSymbol: async (id: string, symbol: string) => local.addSymbol(id, symbol),
    removeSymbol: async (id: string, symbol: string) => local.removeSymbol(id, symbol),
    removeGroup: async (id: string) => local.removeGroup(id), restoreGroup: async (id: string) => local.restoreGroup(id),
    moveGroup: async (id: string, targetIndex: number) => local.moveGroup(id, targetIndex),
  };
};

test("creates and restores a watchlist group", async () => {
  const user = userEvent.setup();
  render(<WatchlistPage repository={asyncRepository()} />);
  await user.type(screen.getByLabelText("新分组名称"), "AI 基础设施");
  await user.click(screen.getByRole("button", { name: "创建分组" }));
  await user.click(await screen.findByRole("button", { name: "删除 AI 基础设施" }));
  await user.click(await screen.findByRole("button", { name: "恢复 AI 基础设施" }));
  expect(screen.getByRole("heading", { name: "AI 基础设施" })).toBeVisible();
});

test("renames a group and removes a symbol", async () => {
  const user = userEvent.setup();
  localStorage.setItem("stock_m:watchlists:v1", JSON.stringify([{ id: "ai", name: "AI", symbols: ["NVDA"], order: 0 }]));
  render(<WatchlistPage repository={asyncRepository()} />);
  await user.click(await screen.findByRole("button", { name: "重命名 AI" }));
  await user.clear(screen.getByLabelText("分组名称"));
  await user.type(screen.getByLabelText("分组名称"), "AI 基础设施");
  await user.click(screen.getByRole("button", { name: "确认重命名" }));
  await user.click(await screen.findByRole("button", { name: "移除 NVDA" }));
  expect(screen.getByRole("heading", { name: "AI 基础设施" })).toBeVisible();
  expect(screen.queryByText("NVDA")).not.toBeInTheDocument();
});

test("shows one live quote batch for deduplicated watchlist symbols", async () => {
  localStorage.setItem("stock_m:watchlists:v1", JSON.stringify([{ id: "one", name: "One", symbols: ["NVDA", "AAPL"], order: 0 }, { id: "two", name: "Two", symbols: ["NVDA", "MSFT"], order: 1 }]));
  const client = { getQuotes: vi.fn().mockResolvedValue({ data: [{ symbol: "NVDA", price: 170, currency: "USD", marketSession: "regular" }], source: "alpaca", asOf: "2026-08-07T10:00:00Z", fetchedAt: "2026-08-07T10:00:00Z", expiresAt: "2026-08-07T10:01:00Z", stale: false, notices: [] }) };
  render(<WatchlistPage repository={asyncRepository()} marketClient={client as never} />);
  expect((await screen.findAllByText("170")).length).toBe(2);
  expect(client.getQuotes).toHaveBeenCalledWith(["NVDA", "AAPL", "MSFT"]);
});

test("loads groups from the injected asynchronous repository", async () => {
  const repository = asyncRepository();
  repository.list = vi.fn(async () => [{ id: "server", name: "Server State", symbols: [], order: 0, version: 4 }]);

  render(<WatchlistPage repository={repository} />);

  expect(await screen.findByRole("heading", { name: "Server State" })).toBeVisible();
  expect(repository.list).toHaveBeenCalled();
});
