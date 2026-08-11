import type { BrokerOrder, BrokerOrderStatus } from "../../shared/broker";
import WebSocket from "ws";

type Message = { stream: string; data: Record<string, unknown> };

export class AlpacaTradeUpdates {
  private sent: unknown[] = [];
  private seen = new Set<string>();

  constructor(private input: { keyId: string; secretKey: string; observe(order: BrokerOrder, event: string): Promise<unknown> }) {
    this.sent.push({ action: "auth", key: input.keyId, secret: input.secretKey });
  }

  outgoing() { return [...this.sent]; }
  drainOutgoing() { return this.sent.splice(0); }

  async accept(message: Message): Promise<boolean> {
    if (message.stream === "authorization") {
      if (message.data.status !== "authorized") return false;
      this.sent.push({ action: "listen", data: { streams: ["trade_updates"] } });
      return true;
    }
    if (message.stream !== "trade_updates") return false;
    const raw = message.data.order as Record<string, unknown>;
    const event = String(message.data.event);
    const id = `${raw.id}:${event}:${raw.updated_at}:${raw.filled_qty}`;
    if (this.seen.has(id)) return true;
    this.seen.add(id);
    await this.input.observe({
      remoteOrderId: String(raw.id),
      clientOrderId: String(raw.client_order_id),
      symbol: String(raw.symbol),
      side: raw.side as "buy" | "sell",
      quantity: String(raw.qty),
      filledQuantity: String(raw.filled_qty),
      type: raw.type as "market" | "limit",
      timeInForce: raw.time_in_force as "day" | "gtc",
      limitPrice: raw.limit_price == null ? undefined : String(raw.limit_price),
      status: String(raw.status) as BrokerOrderStatus,
      submittedAt: String(raw.submitted_at),
      updatedAt: String(raw.updated_at),
      filledAveragePrice: raw.filled_avg_price == null ? undefined : String(raw.filled_avg_price),
    }, event);
    return true;
  }
}

export interface TradeUpdateSocket {
  readyState: number;
  on(event: string, listener: (...args: any[]) => void): unknown;
  once(event: string, listener: (...args: any[]) => void): unknown;
  send(value: string): unknown;
  close(): void;
  terminate(): void;
}

interface StreamDependencies {
  createSocket(url: string): TradeUpdateSocket;
  setTimeout(callback: () => void, delay: number): ReturnType<typeof setTimeout>;
  clearTimeout(timer: ReturnType<typeof setTimeout>): void;
}

const defaultDependencies: StreamDependencies = {
  createSocket: (url) => new WebSocket(url) as TradeUpdateSocket,
  setTimeout: (callback, delay) => setTimeout(callback, delay),
  clearTimeout: (timer) => clearTimeout(timer),
};

export function startAlpacaTradeUpdateStream(
  input: { keyId: string; secretKey: string; observe(order: BrokerOrder, event: string): Promise<unknown>; onHealth?(healthy: boolean): void },
  dependencies: Partial<StreamDependencies> = {},
) {
  const deps = { ...defaultDependencies, ...dependencies };
  let stopped = false;
  let attempt = 0;
  let socket: TradeUpdateSocket | undefined;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let stopPromise: Promise<void> | undefined;
  const report = (healthy: boolean) => input.onHealth?.(healthy);

  const scheduleReconnect = () => {
    if (stopped || reconnectTimer) return;
    const delay = Math.min(30_000, 1_000 * 2 ** attempt++);
    reconnectTimer = deps.setTimeout(() => {
      reconnectTimer = undefined;
      connect();
    }, delay);
    reconnectTimer.unref?.();
  };

  const connect = () => {
    if (stopped) return;
    report(false);
    const protocol = new AlpacaTradeUpdates(input);
    const current = deps.createSocket("wss://paper-api.alpaca.markets/stream");
    socket = current;
    current.on("open", () => {
      attempt = 0;
      for (const message of protocol.drainOutgoing()) current.send(JSON.stringify(message));
    });
    current.on("message", (data: unknown) => {
      void (async () => {
        const messages = JSON.parse(String(data)) as Message | Message[];
        let healthy = false;
        for (const message of Array.isArray(messages) ? messages : [messages]) {
          healthy = await protocol.accept(message) || healthy;
          for (const outgoing of protocol.drainOutgoing()) current.send(JSON.stringify(outgoing));
        }
        if (!stopped) report(healthy);
      })().catch(() => report(false));
    });
    current.on("close", () => {
      if (socket === current) socket = undefined;
      report(false);
      scheduleReconnect();
    });
    current.on("error", () => report(false));
  };

  connect();
  return {
    stop: () => {
      if (stopPromise) return stopPromise;
      stopped = true;
      report(false);
      if (reconnectTimer) {
        deps.clearTimeout(reconnectTimer);
        reconnectTimer = undefined;
      }
      const current = socket;
      socket = undefined;
      stopPromise = new Promise<void>((resolve) => {
        if (!current || current.readyState === 3) { resolve(); return; }
        let finished = false;
        let forceTimer: ReturnType<typeof setTimeout> | undefined;
        const finish = () => {
          if (finished) return;
          finished = true;
          if (forceTimer) deps.clearTimeout(forceTimer);
          resolve();
        };
        current.once("close", finish);
        forceTimer = deps.setTimeout(() => {
          if (current.readyState !== 3) current.terminate();
          finish();
        }, 1_000);
        forceTimer.unref?.();
        if (current.readyState === 0) current.terminate();
        else current.close();
      });
      return stopPromise;
    },
  };
}
