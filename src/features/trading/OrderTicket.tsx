import { useEffect, useMemo, useState } from "react";
import type { OrderPreview, PaperOrderDraft, PaperOrderType, PaperTimeInForce } from "../../../shared/broker";
import { OrderConfirmationDialog } from "./OrderConfirmationDialog";
import { PaperTradingApiClient, type PaperTradingApi, type PaperTradingStatus } from "./paperTradingApiClient";
import "./trading.css";

const defaultApi = new PaperTradingApiClient();
const newKey = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

export function OrderTicket({ symbol, api = defaultApi, now = () => new Date() }: { symbol: string; api?: PaperTradingApi; now?: () => Date }) {
  const normalizedSymbol = symbol.toUpperCase();
  const [status, setStatus] = useState<PaperTradingStatus>();
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [quantity, setQuantity] = useState("");
  const [type, setType] = useState<PaperOrderType>("market");
  const [timeInForce, setTimeInForce] = useState<PaperTimeInForce>("day");
  const [limitPrice, setLimitPrice] = useState("");
  const [preview, setPreview] = useState<OrderPreview>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    void api.getStatus().then((value) => { if (active) setStatus(value); })
      .catch(() => { if (active) setStatus({ enabled: false, configured: false, ready: false }); });
    return () => { active = false; };
  }, [api]);

  const expired = useMemo(() => preview ? Date.parse(preview.expiresAt) <= now().getTime() : false, [now, preview]);
  if (!status) return <p className="paper-trading-state">正在检查 Alpaca Paper 状态</p>;
  if (!status.ready) return <p className="paper-trading-state">Alpaca Paper 尚未连接</p>;

  const requestPreview = async () => {
    setBusy(true); setMessage("");
    try {
      const draft: PaperOrderDraft = {
        symbol: normalizedSymbol,
        side,
        quantity,
        type,
        timeInForce,
        ...(type === "limit" ? { limitPrice } : {}),
      };
      setPreview(await api.createPreview(draft, newKey("paper-preview")));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "订单预览失败");
    } finally { setBusy(false); }
  };

  const confirm = async () => {
    if (!preview || expired || busy) return;
    setBusy(true); setMessage("");
    try {
      await api.createIntent(preview.token, newKey("paper-intent"));
      setPreview(undefined); setOpen(false); setMessage("订单已进入提交队列");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "订单提交失败");
    } finally { setBusy(false); }
  };

  return <section className="paper-order-ticket">
    {!open && !preview && <button type="button" onClick={() => { setOpen(true); setMessage(""); }}>创建 Alpaca Paper 订单</button>}
    {open && !preview && <form onSubmit={(event) => { event.preventDefault(); void requestPreview(); }}>
      <h2>Alpaca Paper 订单</h2>
      <label>股票代码<input aria-label="股票代码" value={normalizedSymbol} readOnly /></label>
      <label>方向<select aria-label="方向" value={side} onChange={(event) => setSide(event.target.value as "buy" | "sell")}><option value="buy">买入</option><option value="sell">卖出</option></select></label>
      <label>数量<input aria-label="数量" inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>
      <label>订单类型<select aria-label="订单类型" value={type} onChange={(event) => setType(event.target.value as PaperOrderType)}><option value="market">市价</option><option value="limit">限价</option></select></label>
      {type === "limit" && <label>限价<input aria-label="限价" inputMode="decimal" value={limitPrice} onChange={(event) => setLimitPrice(event.target.value)} /></label>}
      <label>有效期<select aria-label="有效期" value={timeInForce} onChange={(event) => setTimeInForce(event.target.value as PaperTimeInForce)}><option value="day">DAY</option><option value="gtc">GTC</option></select></label>
      <div className="paper-order-actions"><button type="button" className="secondary" onClick={() => setOpen(false)}>取消</button><button type="submit" disabled={busy || !quantity}>{busy ? "正在预览" : "预览订单"}</button></div>
    </form>}
    {preview && <OrderConfirmationDialog preview={preview} expired={expired} busy={busy} onBack={() => setPreview(undefined)} onConfirm={() => { void confirm(); }} />}
    {message && <p role="status">{message}</p>}
  </section>;
}
