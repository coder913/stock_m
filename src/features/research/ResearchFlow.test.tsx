import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { expect, test } from "vitest";
import { ResearchPage } from "./ResearchPage";

test("requires a saved thesis before paper purchase", async () => {
  localStorage.clear();
  render(<MemoryRouter initialEntries={["/stocks/NVDA"]}><Routes><Route path="/stocks/:symbol" element={<ResearchPage />} /></Routes></MemoryRouter>);
  await screen.findByRole("heading", { name: /NVDA/ });
  expect(screen.getByRole("button", { name: "确认模拟买入" })).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "保存投资逻辑" }));
  expect(screen.getByText("投资逻辑已保存")).toBeVisible();
  expect(screen.getByRole("button", { name: "确认模拟买入" })).toBeEnabled();
});
