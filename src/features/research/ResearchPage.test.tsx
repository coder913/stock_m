import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { expect, test } from "vitest";
import { ResearchPage } from "./ResearchPage";

test("shows NVDA research with freshness and evidence", async () => {
  render(<MemoryRouter initialEntries={["/stocks/NVDA"]}><Routes><Route path="/stocks/:symbol" element={<ResearchPage />} /></Routes></MemoryRouter>);
  expect(await screen.findByRole("heading", { name: /NVDA/ })).toBeVisible();
  expect(screen.getByText("延迟 15 分钟")).toBeVisible();
  expect(screen.getByRole("heading", { name: "最新证据" })).toBeVisible();
});
