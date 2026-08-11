import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { PaperOrderView, PaperPortfolioApi } from "./paperPortfolioApiClient";
import { PaperOrderHistory } from "./PaperOrderHistory";

const order = (state = "partially_filled"): PaperOrderView => ({
  id: "order-1",
  clientOrderId: "stock-m-order-1",
  symbol: "NVDA",
  side: "buy",
  quantity: "1.00000000",
  orderType: "limit",
  timeInForce: "gtc",
  limitPrice: "100.25000000",
  confirmedAt: "2026-08-11T14:00:00.000Z",
  state,
  remoteOrderId: "remote-1",
  updatedAt: "2026-08-11T14:01:00.000Z",
});

const api = (overrides: Partial<PaperPortfolioApi> = {}): PaperPortfolioApi => ({
  getOverview: vi.fn(),
  listOrders: vi.fn().mockResolvedValue([order()]),
  getTimeline: vi.fn().mockResolvedValue([
    {
      id: "event-1",
      orderIntentId: "order-1",
      remoteEventId: "partial-1",
      event: "remote.partially_filled",
      payloadJson: { filledQuantity: "0.50000000", filledAveragePrice: "99.75000000" },
      occurredAt: "2026-08-11T14:00:30.000Z",
      createdAt: "2026-08-11T14:00:30.000Z",
    },
    {
      id: "event-2",
      orderIntentId: "order-1",
      remoteEventId: "cancel-1",
      event: "command.cancel_requested",
      payloadJson: {},
      occurredAt: "2026-08-11T14:00:40.000Z",
      createdAt: "2026-08-11T14:00:40.000Z",
    },
    {
      id: "event-3",
      orderIntentId: "order-1",
      remoteEventId: "fill-1",
      event: "remote.filled",
      payloadJson: { filledQuantity: "1.00000000", filledAveragePrice: "99.50000000" },
      occurredAt: "2026-08-11T14:00:50.000Z",
      createdAt: "2026-08-11T14:00:50.000Z",
    },
  ]),
  cancelOrder: vi.fn().mockResolvedValue({ status: "cancel_pending" }),
  listLedger: vi.fn(),
  reconcile: vi.fn(),
  ...overrides,
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

test("expands full order details and preserves the complete event timeline", async () => {
  const client = api();
  render(<PaperOrderHistory api={client} />);

  fireEvent.click(await screen.findByRole("button", { name: "查看 NVDA 订单详情" }));

  expect(await screen.findByText("stock-m-order-1")).toBeInTheDocument();
  expect(screen.getByText("remote-1")).toBeInTheDocument();
  expect(screen.getAllByText("部分成交")).toHaveLength(2);
  expect(screen.getByText("已成交 0.5，均价 99.75")).toBeInTheDocument();
  expect(screen.getByText("已请求撤单")).toBeInTheDocument();
  expect(screen.getByText("全部成交")).toBeInTheDocument();
  expect(screen.getByText("已成交 1，均价 99.5")).toBeInTheDocument();
  expect(client.getTimeline).toHaveBeenCalledWith("order-1");
});

test("submits one cancel intent and immediately refreshes order and timeline", async () => {
  const listOrders = vi.fn()
    .mockResolvedValueOnce([order("accepted")])
    .mockResolvedValue([order("cancel_pending")]);
  const client = api({ listOrders });
  render(<PaperOrderHistory api={client} />);

  fireEvent.click(await screen.findByRole("button", { name: "查看 NVDA 订单详情" }));
  await screen.findByText("部分成交");
  fireEvent.click(screen.getByRole("button", { name: "撤销 NVDA 订单" }));

  await waitFor(() => expect(client.cancelOrder).toHaveBeenCalledWith("order-1", expect.any(String)));
  await waitFor(() => expect(listOrders).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(client.getTimeline).toHaveBeenCalledTimes(2));
  expect(await screen.findByText("撤单处理中")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "撤销 NVDA 订单" })).not.toBeInTheDocument();
});

test("does not offer cancellation for a terminal order", async () => {
  render(<PaperOrderHistory api={api({ listOrders: vi.fn().mockResolvedValue([order("filled")]) })} />);

  expect(await screen.findByText("全部成交")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "撤销 NVDA 订单" })).not.toBeInTheDocument();
});

test("refreshes orders and an expanded timeline every five seconds", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const client = api();
  render(<PaperOrderHistory api={client} />);
  fireEvent.click(await screen.findByRole("button", { name: "查看 NVDA 订单详情" }));
  await screen.findByText("部分成交");

  await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });

  await waitFor(() => expect(client.listOrders).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(client.getTimeline).toHaveBeenCalledTimes(2));
});

test("shows a retry action when the initial order request fails", async () => {
  const listOrders = vi.fn()
    .mockRejectedValueOnce(new Error("network unavailable"))
    .mockResolvedValueOnce([order()]);
  render(<PaperOrderHistory api={api({ listOrders })} />);

  expect(await screen.findByRole("alert")).toHaveTextContent("network unavailable");
  fireEvent.click(screen.getByRole("button", { name: "重试加载订单" }));

  expect(await screen.findByText("部分成交")).toBeInTheDocument();
  expect(listOrders).toHaveBeenCalledTimes(2);
});
