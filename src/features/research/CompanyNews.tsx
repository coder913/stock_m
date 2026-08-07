import type { CompanyNewsItem } from "../market/apiDomain";

export function CompanyNews({ items, showHeading = true }: { items: CompanyNewsItem[]; showHeading?: boolean }) {
  const content = items.map((item) => (
    <article key={item.id}>
      <a href={item.url} target="_blank" rel="noreferrer">打开原文：{item.headline}</a>
      <p>{item.sourceName} · {item.publishedAt}</p>
    </article>
  ));
  return showHeading ? <section><h2>公司新闻</h2>{content}</section> : <>{content}</>;
}
