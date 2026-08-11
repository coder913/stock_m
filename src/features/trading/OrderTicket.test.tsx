import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { OrderTicket } from "./OrderTicket";

afterEach(cleanup);

const preview = {
  previewId: "preview-1",
  expiresAt: "2026-08-11T14:01:00.000Z",
  normalizedOrder: { symbol: "NVDA", side: "buy" as const, quantity: "1.50000000", type: "market" as const, timeInForce: "day" as const },
  estimatedNotional: "150.00000000",
  quote: { price: "100.00000000", source: "alpaca", asOf: "2026-08-11T13:59:55Z" },
  buyingPower: "10000.00000000",
  positionBefore: "2.00000000",
  estimatedPositionAfter: "3.50000000",
  warnings: ["Paper execution price is not guaranteed"],
  token: "signed-preview",
};

function api(overrides = {}) {
  return {
    getStatus: vi.fn(async () => ({ enabled: true, configured: true, ready: true })),
    createPreview: vi.fn(async () => preview),
    createIntent: vi.fn(async () => ({ id: "intent-1", symbol: "NVDA", status: "pending_submission" as const })),
    ...overrides,
  };
}

test("requires preview followed by a distinct explicit Alpaca Paper confirmation", async () => {
  const user = userEvent.setup();
  const service = api();
  render(<OrderTicket symbol="NVDA" api={service} now={() => new Date("2026-08-11T14:00:30Z")} />);

  await user.click(await screen.findByRole("button", { name: "创建 Alpaca Paper 订单" }));
  await user.clear(screen.getByLabelText("数量"));
  await user.type(screen.getByLabelText("数量"), "1.5");
  await user.click(screen.getByRole("button", { name: "预览订单" }));

  expect(await screen.findByRole("heading", { name: "Alpaca Paper 订单确认" })).toBeVisible();
  expect(screen.getByText("150.00000000 USD")).toBeVisible();
  expect(service.createIntent).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "提交到 Alpaca Paper" }));
  await waitFor(() => expect(service.createIntent).toHaveBeenCalledWith("signed-preview", expect.stringMatching(/^paper-intent-/)));
  expect(await screen.findByRole("status")).toHaveTextContent("订单已进入提交队列");
});

test("keeps economics blank except for the research symbol and supports limit fields", async () => {
  const user = userEvent.setup();
  const service = api();
  render(<OrderTicket symbol="nvda" api={service} now={() => new Date("2026-08-11T14:00:30Z")} />);
  await user.click(await screen.findByRole("button", { name: "创建 Alpaca Paper 订单" }));
  expect(screen.getByLabelText("股票代码")).toHaveValue("NVDA");
  expect(screen.getByLabelText("数量")).toHaveValue("");
  await user.selectOptions(screen.getByLabelText("订单类型"), "limit");
  expect(screen.getByLabelText("限价")).toHaveValue("");
});

test("shows disconnected state without exposing submission controls", async () => {
  render(<OrderTicket symbol="NVDA" api={api({ getStatus: vi.fn(async () => ({ enabled: false, configured: false, ready: false })) })} />);
  expect(await screen.findByText("Alpaca Paper 尚未连接")).toBeVisible();
  expect(screen.queryByRole("button", { name: "创建 Alpaca Paper 订单" })).not.toBeInTheDocument();
});

test("disables confirmation after preview expiry", async () => {
  const user = userEvent.setup();
  render(<OrderTicket symbol="NVDA" api={api()} now={() => new Date("2026-08-11T14:01:01Z")} />);
  await user.click(await screen.findByRole("button", { name: "创建 Alpaca Paper 订单" }));
  await user.type(screen.getByLabelText("数量"), "1.5");
  await user.click(screen.getByRole("button", { name: "预览订单" }));
  expect(await screen.findByRole("button", { name: "预览已过期" })).toBeDisabled();
});
