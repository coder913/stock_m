import { useEffect, useMemo, useState } from "react";
import { WatchlistRepository } from "./watchlistRepository";
import { MarketApiClient } from "../market/marketApiClient";
import type { MarketQuote } from "../market/apiDomain";
import "./watchlist.css";

const repository = () => new WatchlistRepository(localStorage);
const defaultMarketClient = new MarketApiClient();

export function WatchlistPage({ marketClient = defaultMarketClient }: { marketClient?: Pick<MarketApiClient, "getQuotes"> }) {
  const [groups, setGroups] = useState(() => repository().list());
  const [deleted, setDeleted] = useState(() => repository().listDeleted());
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [quotes, setQuotes] = useState<MarketQuote[]>([]);
  const symbols = useMemo(() => [...new Set(groups.flatMap((group) => group.symbols))], [groups]);
  useEffect(() => { if (symbols.length) void marketClient.getQuotes(symbols).then((result) => setQuotes(result.data)).catch(() => undefined); }, [marketClient, symbols]);
  const prices = new Map(quotes.map((quote) => [quote.symbol, quote.price]));
  const refresh = () => { setGroups(repository().list()); setDeleted(repository().listDeleted()); };
  const create = () => { if (!name.trim()) return; repository().createGroup(name); setName(""); refresh(); };
  return <section className="watchlist-page"><header><h1>自选</h1><p>分组不会改变股票研究、投资逻辑或模拟持仓。</p></header>
    <div className="watchlist-create"><label>新分组名称<input value={name} onChange={(event) => setName(event.target.value)} /></label><button type="button" onClick={create}>创建分组</button></div>
    {groups.length === 0 ? <p role="status">尚无自选分组。</p> : <div className="watchlist-groups">{groups.map((group, index) => <article key={group.id}><h2>{group.name}</h2>{group.symbols.length ? <ul>{group.symbols.map((symbol) => <li key={symbol}>{symbol}{prices.get(symbol) !== undefined && <span> {prices.get(symbol)}</span>}<button type="button" onClick={() => { repository().removeSymbol(group.id, symbol); refresh(); }}>移除 {symbol}</button></li>)}</ul> : <p>暂无股票</p>}{renaming === group.id && <span><label>分组名称<input aria-label="分组名称" value={renameValue} onChange={(event) => setRenameValue(event.target.value)} /></label><button type="button" onClick={() => { repository().renameGroup(group.id, renameValue); setRenaming(null); refresh(); }}>确认重命名</button></span>}<div><button type="button" onClick={() => { repository().moveGroup(group.id, index - 1); refresh(); }} disabled={index === 0}>上移</button><button type="button" onClick={() => { repository().moveGroup(group.id, index + 1); refresh(); }} disabled={index === groups.length - 1}>下移</button><button type="button" onClick={() => { setRenaming(group.id); setRenameValue(group.name); }}>重命名 {group.name}</button><button type="button" onClick={() => { repository().removeGroup(group.id); refresh(); }}>删除 {group.name}</button></div></article>)}</div>}
    {deleted.length > 0 && <section><h2>最近删除</h2>{deleted.map((group) => <button key={group.id} type="button" onClick={() => { repository().restoreGroup(group.id); refresh(); }}>恢复 {group.name}</button>)}</section>}
  </section>;
}
