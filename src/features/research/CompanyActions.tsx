import type { MarketEvent } from "../market/apiDomain";
export function CompanyActions({ items }: { items: MarketEvent[] }) { return <section><h2>公司行为</h2>{items.length ? items.map((item) => <p key={item.id}>{item.scheduledAt} · {item.type} · {item.title}</p>) : <p>暂无公司行为</p>}</section>; }
