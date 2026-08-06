import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test } from "vitest";
import { WatchlistPage } from "./WatchlistPage";

beforeEach(() => localStorage.clear());

test("creates and restores a watchlist group", async () => {
  const user = userEvent.setup();
  render(<WatchlistPage />);
  await user.type(screen.getByLabelText("新分组名称"), "AI 基础设施");
  await user.click(screen.getByRole("button", { name: "创建分组" }));
  await user.click(screen.getByRole("button", { name: "删除 AI 基础设施" }));
  await user.click(screen.getByRole("button", { name: "恢复 AI 基础设施" }));
  expect(screen.getByRole("heading", { name: "AI 基础设施" })).toBeVisible();
});
