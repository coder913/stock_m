import { EventEmitter } from "node:events";
import { afterEach, expect, test, vi } from "vitest";
import { AlpacaTradeUpdates, startAlpacaTradeUpdateStream, type TradeUpdateSocket } from "./alpacaTradeUpdates";

test("authenticates, subscribes and deduplicates remote trade updates", async () => {
  const observed = vi.fn();
  const stream = new AlpacaTradeUpdates({ keyId: "k", secretKey: "s", observe: observed });
  await stream.accept({ stream: "authorization", data: { status: "authorized" } });
  expect(stream.outgoing()).toEqual([{ action: "auth", key: "k", secret: "s" }, { action: "listen", data: { streams: ["trade_updates"] } }]);
  await expect(stream.accept({ stream: "listening", data: { streams: ["trade_updates"] } })).resolves.toBe(true);
  const update = { stream: "trade_updates", data: { event: "new", order: { id: "o1", client_order_id: "c1", symbol: "AAPL", side: "buy", qty: "1", filled_qty: "0", type: "market", time_in_force: "day", status: "new", submitted_at: "2026-08-11T00:00:00Z", updated_at: "2026-08-11T00:00:00Z" } } };
  await stream.accept(update);
  await stream.accept(update);
  expect(observed).toHaveBeenCalledTimes(1);
});

class FakeSocket extends EventEmitter implements TradeUpdateSocket {
  readyState = 0;
  sent: string[] = [];
  closeCalls = 0;
  terminateCalls = 0;
  send(value: string) { this.sent.push(value); }
  open() { this.readyState = 1; this.emit("open"); }
  message(value: unknown) { this.emit("message", JSON.stringify(value)); }
  remoteClose() { this.readyState = 3; this.emit("close"); }
  close() { this.closeCalls += 1; this.remoteClose(); }
  terminate() { this.terminateCalls += 1; this.remoteClose(); }
}

afterEach(() => vi.useRealTimers());

test("reports health, reconnects, and cancels reconnects on idempotent stop", async () => {
  vi.useFakeTimers();
  const sockets: FakeSocket[] = [];
  const onHealth = vi.fn();
  const stream = startAlpacaTradeUpdateStream({ keyId: "k", secretKey: "s", observe: vi.fn(), onHealth }, {
    createSocket: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
  });

  expect(onHealth).toHaveBeenLastCalledWith(false);
  sockets[0].open();
  sockets[0].message({ stream: "authorization", data: { status: "authorized" } });
  await vi.runAllTicks();
  expect(onHealth).toHaveBeenLastCalledWith(true);
  sockets[0].message({ stream: "listening", data: { streams: ["trade_updates"] } });
  await vi.runAllTicks();
  expect(onHealth).toHaveBeenLastCalledWith(true);

  sockets[0].remoteClose();
  expect(onHealth).toHaveBeenLastCalledWith(false);
  await vi.advanceTimersByTimeAsync(1_000);
  expect(sockets).toHaveLength(2);

  await Promise.all([stream.stop(), stream.stop()]);
  expect(sockets[1].terminateCalls).toBe(1);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(sockets).toHaveLength(2);
});
