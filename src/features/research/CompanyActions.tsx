import type { MarketEvent } from "../market/apiDomain";

export function CompanyActions({ items, showHeading = true }: { items: MarketEvent[]; showHeading?: boolean }) {
  const content = items.length
    ? items.map((item) => <p key={item.id}>{item.scheduledAt} · {item.type} · {item.title}</p>)
    : <p>暂无公司行为</p>;
  return showHeading ? <section><h2>公司行为</h2>{content}</section> : <>{content}</>;
}
