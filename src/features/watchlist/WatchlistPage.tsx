import { useState } from "react";
import { WatchlistRepository } from "./watchlistRepository";
import "./watchlist.css";

const repository = () => new WatchlistRepository(localStorage);

export function WatchlistPage() {
  const [groups, setGroups] = useState(() => repository().list());
  const [deleted, setDeleted] = useState(() => repository().listDeleted());
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const refresh = () => { setGroups(repository().list()); setDeleted(repository().listDeleted()); };
  const create = () => { if (!name.trim()) return; repository().createGroup(name); setName(""); refresh(); };
  return <section className="watchlist-page"><header><h1>自选</h1><p>分组不会改变股票研究、投资逻辑或模拟持仓。</p></header>
    <div className="watchlist-create"><label>新分组名称<input value={name} onChange={(event) => setName(event.target.value)} /></label><button type="button" onClick={create}>创建分组</button></div>
    {groups.length === 0 ? <p role="status">尚无自选分组。</p> : <div className="watchlist-groups">{groups.map((group, index) => <article key={group.id}><h2>{group.name}</h2>{group.symbols.length ? <ul>{group.symbols.map((symbol) => <li key={symbol}>{symbol}<button type="button" onClick={() => { repository().removeSymbol(group.id, symbol); refresh(); }}>移除 {symbol}</button></li>)}</ul> : <p>暂无股票</p>}{renaming === group.id && <span><label>分组名称<input aria-label="分组名称" value={renameValue} onChange={(event) => setRenameValue(event.target.value)} /></label><button type="button" onClick={() => { repository().renameGroup(group.id, renameValue); setRenaming(null); refresh(); }}>确认重命名</button></span>}<div><button type="button" onClick={() => { repository().moveGroup(group.id, index - 1); refresh(); }} disabled={index === 0}>上移</button><button type="button" onClick={() => { repository().moveGroup(group.id, index + 1); refresh(); }} disabled={index === groups.length - 1}>下移</button><button type="button" onClick={() => { setRenaming(group.id); setRenameValue(group.name); }}>重命名 {group.name}</button><button type="button" onClick={() => { repository().removeGroup(group.id); refresh(); }}>删除 {group.name}</button></div></article>)}</div>}
    {deleted.length > 0 && <section><h2>最近删除</h2>{deleted.map((group) => <button key={group.id} type="button" onClick={() => { repository().restoreGroup(group.id); refresh(); }}>恢复 {group.name}</button>)}</section>}
  </section>;
}
