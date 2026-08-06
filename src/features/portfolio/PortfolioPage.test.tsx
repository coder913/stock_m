import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test } from "vitest";
import { PortfolioPage } from "./PortfolioPage";

beforeEach(() => localStorage.clear());

test("shows portfolio tabs and records a dividend using the amount form", async () => {
  const user = userEvent.setup();
  render(<PortfolioPage />);
  expect(screen.getByRole("tab", { name: "组合总览" })).toBeVisible();
  await user.click(screen.getByRole("tab", { name: "持仓与交易" }));
  await user.click(screen.getByRole("button", { name: "记录交易" }));
  await user.selectOptions(screen.getByLabelText("事件类型"), "dividend");
  expect(screen.getByLabelText("金额")).toBeVisible();
  expect(screen.queryByLabelText("数量")).not.toBeInTheDocument();
});
