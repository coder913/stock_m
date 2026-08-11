import { useCallback, useEffect, useRef, useState } from "react";
import type {
  PaperOrderTimelineEventView,
  PaperOrderView,
  PaperPortfolioApi,
} from "./paperPortfolioApiClient";

const REFRESH_INTERVAL_MS = 5_000;
const cancelableStates = new Set(["accepted", "new", "partially_filled"]);

const stateLabels: Record<string, string> = {
  pending_submission: "等待提交",
  reconciling: "对账中",
  accepted: "已受理",
  new: "已挂单",
  partially_filled: "部分成交",
  cancel_pending: "撤单处理中",
  filled: "全部成交",
  canceled: "已撤销",
  rejected: "已拒绝",
  expired: "已过期",
};

const eventLabels: Record<string, string> = {
  "command.reconciling": "开始对账",
  "command.cancel_requested": "已请求撤单",
  "remote.accepted": "券商已受理",
  "remote.new": "订单已挂出",
  "remote.partially_filled": "部分成交",
  "remote.filled": "全部成交",
  "remote.canceled": "券商已撤销",
  "remote.rejected": "券商已拒绝",
  "remote.expired": "订单已过期",
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "请求失败";
}

function displayDecimal(value: unknown): string | undefined {
  if (typeof value !== "string" || !/^-?\d+(?:\.\d+)?$/.test(value)) return undefined;
  const [integer, fraction] = value.split(".");
  const trimmed = fraction?.replace(/0+$/, "");
  return trimmed ? `${integer}.${trimmed}` : integer;
}

function eventSummary(event: PaperOrderTimelineEventView): string | undefined {
  const quantity = displayDecimal(event.payloadJson.filledQuantity);
  const price = displayDecimal(event.payloadJson.filledAveragePrice);
  if (quantity && price) return `已成交 ${quantity}，均价 ${price}`;
  if (quantity) return `已成交 ${quantity}`;
  return undefined;
}

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString("zh-CN", { hour12: false });
}

function idempotencyKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `cancel-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function PaperOrderHistory({ api }: { api: PaperPortfolioApi }) {
  const [orders, setOrders] = useState<PaperOrderView[]>([]);
  const [expandedId, setExpandedId] = useState<string>();
  const [timelines, setTimelines] = useState<Record<string, PaperOrderTimelineEventView[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [timelineErrors, setTimelineErrors] = useState<Record<string, string>>({});
  const [cancelingId, setCancelingId] = useState<string>();
  const generation = useRef(0);
  const expandedIdRef = useRef<string | undefined>(undefined);

  useEffect(() => { expandedIdRef.current = expandedId; }, [expandedId]);

  const loadOrders = useCallback(async () => {
    const requestGeneration = generation.current;
    try {
      const next = await api.listOrders();
      if (generation.current !== requestGeneration) return;
      setOrders(next);
      setError(undefined);
    } catch (requestError) {
      if (generation.current === requestGeneration) setError(errorMessage(requestError));
    } finally {
      if (generation.current === requestGeneration) setLoading(false);
    }
  }, [api]);

  const loadTimeline = useCallback(async (id: string) => {
    const requestGeneration = generation.current;
    try {
      const next = await api.getTimeline(id);
      if (generation.current !== requestGeneration) return;
      setTimelines((current) => ({ ...current, [id]: next }));
      setTimelineErrors((current) => {
        if (!current[id]) return current;
        const nextErrors = { ...current };
        delete nextErrors[id];
        return nextErrors;
      });
    } catch (requestError) {
      if (generation.current === requestGeneration) {
        setTimelineErrors((current) => ({ ...current, [id]: errorMessage(requestError) }));
      }
    }
  }, [api]);

  useEffect(() => {
    generation.current += 1;
    void loadOrders();
    const interval = window.setInterval(() => {
      void loadOrders();
      if (expandedIdRef.current) void loadTimeline(expandedIdRef.current);
    }, REFRESH_INTERVAL_MS);
    return () => {
      generation.current += 1;
      window.clearInterval(interval);
    };
  }, [loadOrders, loadTimeline]);

  const toggleDetails = (id: string) => {
    if (expandedId === id) {
      setExpandedId(undefined);
      return;
    }
    setExpandedId(id);
    void loadTimeline(id);
  };

  const cancel = async (order: PaperOrderView) => {
    if (cancelingId || !cancelableStates.has(order.state)) return;
    setCancelingId(order.id);
    try {
      await api.cancelOrder(order.id, idempotencyKey());
      await Promise.all([loadOrders(), expandedId === order.id ? loadTimeline(order.id) : Promise.resolve()]);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setCancelingId(undefined);
    }
  };

  return (
    <section className="paper-orders">
      <div className="paper-orders-heading">
        <h2>Paper 订单</h2>
        <span aria-live="polite">每 5 秒自动刷新</span>
      </div>
      {error && (
        <div role="alert" className="paper-orders-error">
          <span>{error}</span>
          <button type="button" onClick={() => void loadOrders()}>重试加载订单</button>
        </div>
      )}
      {loading ? <p>正在加载 Paper 订单…</p> : (
        <table aria-label="Paper 订单历史">
          <thead><tr><th>股票</th><th>方向</th><th>数量</th><th>状态</th><th>更新时间</th><th>操作</th></tr></thead>
          <tbody>
            {orders.map((order) => {
              const expanded = expandedId === order.id;
              return [
                <tr key={order.id}>
                  <th>{order.symbol}</th>
                  <td>{order.side === "buy" ? "买入" : "卖出"}</td>
                  <td>{displayDecimal(order.quantity) ?? order.quantity}</td>
                  <td>{stateLabels[order.state] ?? order.state}</td>
                  <td><time dateTime={order.updatedAt}>{formatTime(order.updatedAt)}</time></td>
                  <td className="paper-order-actions">
                    <button type="button" aria-expanded={expanded} onClick={() => toggleDetails(order.id)}>
                      {expanded ? `收起 ${order.symbol} 订单详情` : `查看 ${order.symbol} 订单详情`}
                    </button>
                    {cancelableStates.has(order.state) && (
                      <button type="button" disabled={cancelingId === order.id} onClick={() => void cancel(order)} aria-label={`撤销 ${order.symbol} 订单`}>
                        {cancelingId === order.id ? "正在撤单…" : "撤单"}
                      </button>
                    )}
                  </td>
                </tr>,
                expanded && (
                  <tr key={`${order.id}-details`}>
                    <td colSpan={6}>
                      <div className="paper-order-detail">
                        <dl>
                          <div><dt>订单类型</dt><dd>{order.orderType === "limit" ? "限价" : "市价"}</dd></div>
                          <div><dt>有效期</dt><dd>{order.timeInForce.toUpperCase()}</dd></div>
                          <div><dt>限价</dt><dd>{displayDecimal(order.limitPrice) ?? "—"}</dd></div>
                          <div><dt>客户端订单号</dt><dd>{order.clientOrderId}</dd></div>
                          <div><dt>远端订单号</dt><dd>{order.remoteOrderId ?? "尚未分配"}</dd></div>
                          <div><dt>确认时间</dt><dd><time dateTime={order.confirmedAt}>{formatTime(order.confirmedAt)}</time></dd></div>
                        </dl>
                        <h3>订单时间线</h3>
                        {timelineErrors[order.id] && <p role="alert">{timelineErrors[order.id]}</p>}
                        {!timelines[order.id] && !timelineErrors[order.id] && <p>正在加载时间线…</p>}
                        {timelines[order.id]?.length === 0 && <p>暂无订单事件</p>}
                        {!!timelines[order.id]?.length && (
                          <ol className="paper-order-timeline">
                            {timelines[order.id].map((event) => (
                              <li key={event.id}>
                                <time dateTime={event.occurredAt}>{formatTime(event.occurredAt)}</time>
                                <strong>{eventLabels[event.event] ?? event.event}</strong>
                                {eventSummary(event) && <span>{eventSummary(event)}</span>}
                              </li>
                            ))}
                          </ol>
                        )}
                      </div>
                    </td>
                  </tr>
                ),
              ];
            })}
          </tbody>
        </table>
      )}
      {!loading && !orders.length && !error && <p>暂无 Paper 订单</p>}
    </section>
  );
}
