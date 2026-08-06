import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { expect, test } from "vitest";
import { DiscoveryPage } from "./DiscoveryPage";

test("selecting a template updates conditions and matching results", async () => {
  const user = userEvent.setup();
  render(<MemoryRouter><DiscoveryPage /></MemoryRouter>);

  await user.click(await screen.findByRole("button", { name: "高质量成长" }));

  expect(screen.getByText("营收同比增长")).toBeVisible();
  expect(screen.getByRole("row", { name: /NVDA/ })).toBeVisible();
  expect(screen.queryByRole("row", { name: /XOM/ })).not.toBeInTheDocument();
});
