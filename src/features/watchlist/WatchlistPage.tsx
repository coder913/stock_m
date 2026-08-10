import { useCallback, useEffect, useMemo, useState } from "react";
import type { AsyncWatchlistRepository, WatchlistGroup } from "../../../shared/watchlist";
import { MarketApiClient } from "../market/marketApiClient";
import type { MarketQuote } from "../market/apiDomain";
import { WatchlistApiRepository } from "./watchlistApiRepository";
import "./watchlist.css";

const defaultRepository = new WatchlistApiRepository();
const defaultMarketClient = new MarketApiClient();

interface WatchlistPageProps {
  repository?: AsyncWatchlistRepository;
  marketClient?: Pick<MarketApiClient, "getQuotes">;
}

export function WatchlistPage({ repository = defaultRepository, marketClient = defaultMarketClient }: WatchlistPageProps) {
  const [groups, setGroups] = useState<WatchlistGroup[]>([]);
  const [deleted, setDeleted] = useState<WatchlistGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [quotes, setQuotes] = useState<MarketQuote[]>([]);

  const refresh = useCallback(async () => {
    try {
      const [activeGroups, deletedGroups] = await Promise.all([repository.list(), repository.listDeleted()]);
      setGroups(activeGroups); setDeleted(deletedGroups); setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "自选数据暂不可用");
    } finally { setLoading(false); }
  }, [repository]);

  useEffect(() => { void refresh(); }, [refresh]);
  const symbols = useMemo(() => [...new Set(groups.flatMap((group) => group.symbols))], [groups]);
  useEffect(() => {
    if (!symbols.length) { setQuotes([]); return; }
    void marketClient.getQuotes(symbols).then((result) => setQuotes(result.data)).catch(() => undefined);
  }, [marketClient, symbols]);
  const prices = new Map(quotes.map((quote) => [quote.symbol, quote.price]));

  const run = async (command: () => Promise<unknown>) => {
    try { await command(); await refresh(); } catch (reason) { setError(reason instanceof Error ? reason.message : "操作失败，请重试"); }
  };
  const create = async () => {
    if (!name.trim()) return;
    await run(() => repository.createGroup(name));
    setName("");
  };

  return <section className="watchlist-page"><header><h1>自选</h1><p>分组不会改变股票研究、投资逻辑或模拟持仓。</p></header>
    <div className="watchlist-create"><label>新分组名称<input value={name} onChange={(event) => setName(event.target.value)} /></label><button type="button" onClick={() => { void create(); }}>创建分组</button></div>
    {error && <p role="alert">{error}</p>}
    {loading ? <p role="status">正在加载自选分组…</p> : groups.length === 0 ? <p role="status">尚无自选分组。</p> : <div className="watchlist-groups">{groups.map((group, index) => <article key={group.id}><h2>{group.name}</h2>{group.symbols.length ? <ul>{group.symbols.map((symbol) => <li key={symbol}>{symbol}{prices.get(symbol) !== undefined && <span> {prices.get(symbol)}</span>}<button type="button" onClick={() => { void run(() => repository.removeSymbol(group.id, symbol)); }}>移除 {symbol}</button></li>)}</ul> : <p>暂无股票</p>}{renaming === group.id && <span><label>分组名称<input aria-label="分组名称" value={renameValue} onChange={(event) => setRenameValue(event.target.value)} /></label><button type="button" onClick={() => { void run(() => repository.renameGroup(group.id, renameValue, group.version)).then(() => setRenaming(null)); }}>确认重命名</button></span>}<div><button type="button" onClick={() => { void run(() => repository.moveGroup(group.id, index - 1)); }} disabled={index === 0}>上移</button><button type="button" onClick={() => { void run(() => repository.moveGroup(group.id, index + 1)); }} disabled={index === groups.length - 1}>下移</button><button type="button" onClick={() => { setRenaming(group.id); setRenameValue(group.name); }}>重命名 {group.name}</button><button type="button" onClick={() => { void run(() => repository.removeGroup(group.id)); }}>删除 {group.name}</button></div></article>)}</div>}
    {deleted.length > 0 && <section><h2>最近删除</h2>{deleted.map((group) => <button key={group.id} type="button" onClick={() => { void run(() => repository.restoreGroup(group.id)); }}>恢复 {group.name}</button>)}</section>}
  </section>;
}
