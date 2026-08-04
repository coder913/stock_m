import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, test } from "vitest";
import { AppShell } from "./AppShell";

test("renders the approved five-item primary navigation", () => {
  render(
    <MemoryRouter>
      <AppShell />
    </MemoryRouter>
  );

  for (const label of ["今日", "发现", "自选", "组合", "日志"]) {
    expect(screen.getByRole("link", { name: label })).toBeVisible();
  }

  expect(screen.getByRole("link", { name: "跳到主要内容" })).toBeVisible();
});
