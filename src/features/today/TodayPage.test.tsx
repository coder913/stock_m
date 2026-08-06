import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { expect, test } from "vitest";
import { TodayPage } from "./TodayPage";

test("changes the research action when the selected signal changes", async () => {
  render(<MemoryRouter><TodayPage /></MemoryRouter>);

  expect(await screen.findByRole("heading", { name: "今天值得关注" })).toBeVisible();
  expect(screen.getByText("延迟 15 分钟")).toBeVisible();
  expect(screen.getByRole("link", { name: "研究 NVDA" })).toHaveAttribute("href", "/stocks/NVDA");

  await userEvent.click(screen.getByRole("button", { name: "查看 AAPL" }));
  expect(screen.getByRole("link", { name: "研究 AAPL" })).toHaveAttribute("href", "/stocks/AAPL");
});
