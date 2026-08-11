import type { OrderPreview } from "../../../shared/broker";

export function OrderConfirmationDialog({
  preview,
  expired,
  busy,
  onConfirm,
  onBack,
}: {
  preview: OrderPreview;
  expired: boolean;
  busy: boolean;
  onConfirm(): void;
  onBack(): void;
}) {
  const order = preview.normalizedOrder;
  return <section className="paper-order-confirmation" role="dialog" aria-modal="true" aria-labelledby="paper-confirm-title">
    <h2 id="paper-confirm-title">Alpaca Paper 订单确认</h2>
    <dl>
      <div><dt>方向</dt><dd>{order.side === "buy" ? "买入" : "卖出"}</dd></div>
      <div><dt>股票</dt><dd>{order.symbol}</dd></div>
      <div><dt>数量</dt><dd>{order.quantity}</dd></div>
      <div><dt>类型</dt><dd>{order.type === "market" ? "市价" : "限价"}</dd></div>
      {order.limitPrice && <div><dt>限价</dt><dd>{order.limitPrice} USD</dd></div>}
      <div><dt>有效期</dt><dd>{order.timeInForce.toUpperCase()}</dd></div>
      <div><dt>预估金额</dt><dd>{preview.estimatedNotional} USD</dd></div>
      <div><dt>参考报价</dt><dd>{preview.quote.price} USD · {preview.quote.source} · {preview.quote.asOf}</dd></div>
      <div><dt>购买力</dt><dd>{preview.buyingPower} USD</dd></div>
      <div><dt>预计持仓</dt><dd>{preview.positionBefore} → {preview.estimatedPositionAfter}</dd></div>
    </dl>
    <ul>{preview.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
    <p>这是模拟账户订单，不会进入真实资金账户；实际成交价格不保证等于参考报价。</p>
    <div className="paper-order-actions">
      <button type="button" className="secondary" disabled={busy} onClick={onBack}>返回修改</button>
      <button type="button" disabled={busy || expired} onClick={onConfirm}>
        {expired ? "预览已过期" : busy ? "正在提交" : "提交到 Alpaca Paper"}
      </button>
    </div>
  </section>;
}
