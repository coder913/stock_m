import { useEffect, useMemo, useState } from "react";
import type { ScreenerCondition, ScreenerMetric, ScreenerTemplate, StockSnapshot } from "./domain";
import type { AsyncDiscoveryStateRepository } from "../../../shared/discoveryState";
import type { AsyncWatchlistRepository, WatchlistGroup } from "../../../shared/watchlist";
import { runScreen, validateConditions } from "./screener";
import { ScreenerPanel } from "./ScreenerPanel";
import { ScreenerResults } from "./ScreenerResults";
import { ThemeView } from "./ThemeView";
import { EventCalendar } from "./EventCalendar";
import { WatchlistApiRepository } from "../watchlist/watchlistApiRepository";
import { DiscoveryStateApiRepository } from "./discoveryStateApiRepository";
import { systemTemplates } from "./templates";
import { MarketApiClient } from "../market/marketApiClient";
import type { MarketEvent } from "../market/apiDomain";
import "./discovery.css";

const copyConditions = (conditions: readonly ScreenerCondition[]): ScreenerCondition[] => conditions.map((condition) => ({ ...condition, value: Array.isArray(condition.value) ? [...condition.value] as [number, number] : condition.value }));
const toCompanyEvent = (event: MarketEvent): import("./domain").CompanyEvent => ({ id: event.id, symbol: event.symbol, date: event.scheduledAt, type: event.type === "corporate-action" ? "corporate-action" : event.type, title: event.title, status: "confirmed", source: event.source });
interface DiscoveryPageProps {
  onAddToWatchlist?: (symbol: string) => void;
  marketClient?: Pick<MarketApiClient, "getUniverse" | "getEvents">;
  stateRepository?: AsyncDiscoveryStateRepository;
  watchlistRepository?: AsyncWatchlistRepository;
}
const defaultMarketClient = new MarketApiClient();
const defaultStateRepository = new DiscoveryStateApiRepository();
const defaultWatchlistRepository = new WatchlistApiRepository();

export function DiscoveryPage({ onAddToWatchlist = () => undefined, marketClient = defaultMarketClient, stateRepository = defaultStateRepository, watchlistRepository = defaultWatchlistRepository }: DiscoveryPageProps) {
  const [stocks, setStocks] = useState<StockSnapshot[]>([]);
  const [conditions, setConditions] = useState<ScreenerCondition[]>(() => copyConditions(systemTemplates[0].conditions));
  const [selectedTemplate, setSelectedTemplate] = useState<ScreenerTemplate>(systemTemplates[0]);
  const [sort, setSort] = useState<{ metric: ScreenerMetric; direction: "asc" | "desc" }>({ metric: "revenueGrowthYoY", direction: "desc" });
  const [screenName, setScreenName] = useState("");
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState<"screen" | "themes" | "calendar" | "saved">("screen");
  const [themes, setThemes] = useState<import("./domain").MarketTheme[]>([]);
  const [events, setEvents] = useState<import("./domain").CompanyEvent[]>([]);
  const [pendingSymbol, setPendingSymbol] = useState<string | null>(null);
  const [groupId, setGroupId] = useState("");
  const [watchlistGroups, setWatchlistGroups] = useState<WatchlistGroup[]>([]);
  useEffect(() => { void marketClient.getUniverse().then((result) => { const mapped = result.data.items.map((item) => ({ symbol: item.symbol, name: item.name ?? item.symbol, industry: item.sector ?? "未分类", metrics: item.metrics })); setStocks(mapped); const groups = new Map<string, typeof mapped>(); for (const item of mapped) groups.set(item.industry, [...(groups.get(item.industry) ?? []), item]); setThemes([...groups.entries()].map(([name, items]) => ({ id: name, name, kind: "industry", marketCapWeight: items.length, changePercent: items.reduce((sum, item) => sum + (item.metrics.dailyChangePercent ?? 0), 0) / items.length, valuationDeviation: 0 }))); }).catch((reason: unknown) => setMessage(reason instanceof Error ? reason.message : "股票池数据暂不可用")); }, [marketClient]);
  useEffect(() => { const from = new Date().toISOString().slice(0, 10); const to = new Date(Date.now() + 31 * 86_400_000).toISOString().slice(0, 10); void marketClient.getEvents({ from, to }).then((result) => setEvents(result.data.map(toCompanyEvent))).catch(() => undefined); }, [marketClient]);
  const results = useMemo(() => runScreen(stocks, conditions).sort((left, right) => ((left.metrics[sort.metric] ?? -Infinity) - (right.metrics[sort.metric] ?? -Infinity)) * (sort.direction === "asc" ? 1 : -1)), [conditions, sort, stocks]);
  const errors = validateConditions(conditions);
  const selectTemplate = (template: ScreenerTemplate) => { setSelectedTemplate(template); setConditions(copyConditions(template.conditions)); };
  const changeCondition = (id: string, value: number) => setConditions((current) => current.map((condition) => condition.id === id ? { ...condition, value } : condition));
  const changeOperator = (id: string, operator: ScreenerCondition["operator"]) => setConditions((current) => current.map((condition) => condition.id === id ? { ...condition, operator } : condition));
  const removeCondition = (id: string) => setConditions((current) => current.filter((condition) => condition.id !== id));
  const addCondition = () => setConditions((current) => [...current, { id: globalThis.crypto?.randomUUID?.() ?? `condition-${Date.now()}`, metric: "price", operator: ">=", value: 5, period: "CURRENT" }]);
  const save = async () => { if (errors.length) { setMessage(errors[0].message); return; } try { await stateRepository.createScreen({ name: screenName || selectedTemplate.name, conditions, sort }); setMessage("筛选已保存"); setScreenName(""); } catch { setMessage("保存失败，请重试"); } };
  const addToWatchlist = async (symbol: string) => {
    onAddToWatchlist(symbol);
    const groups = await watchlistRepository.list().catch(() => []);
    if (!groups.length) { setMessage("请先在自选页创建分组"); return; }
    setWatchlistGroups(groups); setGroupId(groups[0].id); setPendingSymbol(symbol);
  };
  const confirmAdd = async () => { const group = watchlistGroups.find((item) => item.id === groupId); if (!group || !pendingSymbol) return; try { await watchlistRepository.addSymbol(group.id, pendingSymbol); setMessage(`${pendingSymbol} 已加入 ${group.name}`); setPendingSymbol(null); } catch { setMessage("加入自选失败，请重试"); } };
  return <section className="discovery-page">
    <header><p className="freshness">模拟数据 · 延迟 15 分钟</p><h1>发现</h1><p>用可解释条件寻找候选股票，而非生成买卖建议。</p></header>
    <nav className="discovery-tabs" aria-label="发现功能"><button type="button" aria-current={tab === "screen" ? "page" : undefined} onClick={() => setTab("screen")}>策略选股</button><button type="button" aria-current={tab === "themes" ? "page" : undefined} onClick={() => setTab("themes")}>市场主题</button><button type="button" aria-current={tab === "calendar" ? "page" : undefined} onClick={() => setTab("calendar")}>财报日历</button><button type="button" aria-current={tab === "saved" ? "page" : undefined} onClick={() => setTab("saved")}>已保存筛选</button></nav>
    {tab === "themes" ? <ThemeView themes={themes} /> : tab === "calendar" ? <EventCalendar events={events} /> : tab === "saved" ? <SavedScreens repository={stateRepository} onRun={(conditions) => { setConditions(conditions); setTab("screen"); }} /> : <div className="discovery-layout"><ScreenerPanel templates={systemTemplates} conditions={conditions} onTemplateSelect={selectTemplate} onConditionValueChange={changeCondition} onConditionOperatorChange={changeOperator} onRemoveCondition={removeCondition} onAddCondition={addCondition} />
      <div className="screener-main"><div className="screener-toolbar"><strong>{results.length} 个匹配结果</strong><label>排序<select value={`${sort.metric}:${sort.direction}`} onChange={(event) => { const [metric, direction] = event.target.value.split(":") as [ScreenerMetric, "asc" | "desc"]; setSort({ metric, direction }); }}><option value="revenueGrowthYoY:desc">营收增长（高到低）</option><option value="price:asc">价格（低到高）</option></select></label></div>
      <div className="save-screen"><label>筛选名称<input value={screenName} onChange={(event) => setScreenName(event.target.value)} /></label><button type="button" onClick={() => { void save(); }}>保存筛选</button><p role="status">{message}</p>{errors.map((error) => <p key={`${error.conditionId}:${error.code}`} role="alert">{error.message}</p>)}</div>
      <ScreenerResults stocks={results} onAddToWatchlist={addToWatchlist} /></div></div>}
    {pendingSymbol && <div role="dialog" aria-label="加入自选"><p>将 {pendingSymbol} 加入：</p><label>自选分组<select aria-label="自选分组" value={groupId} onChange={(event) => setGroupId(event.target.value)}>{watchlistGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label><button type="button" onClick={() => { void confirmAdd(); }}>确认加入</button><button type="button" onClick={() => setPendingSymbol(null)}>取消</button></div>}
  </section>;
}

function SavedScreens({ repository, onRun }: { repository: AsyncDiscoveryStateRepository; onRun(conditions: ScreenerCondition[]): void }) {
  const [screens, setScreens] = useState<Awaited<ReturnType<AsyncDiscoveryStateRepository["listScreens"]>>>([]);
  const [loading, setLoading] = useState(true);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [name, setName] = useState("");
  const refresh = async () => { try { setScreens(await repository.listScreens()); } finally { setLoading(false); } };
  useEffect(() => { void refresh(); }, [repository]);
  if (loading) return <p role="status">正在加载保存的筛选…</p>;
  if (!screens.length) return <p role="status">尚未保存筛选条件。</p>;
  return <section><h2>已保存筛选</h2>{screens.map((screen) => <article key={screen.id}><strong>{screen.name}</strong><button type="button" onClick={() => onRun(copyConditions(screen.conditions))}>运行 {screen.name}</button><button type="button" onClick={() => { void repository.duplicateScreen(screen.id).then(refresh); }}>复制 {screen.name}</button><button type="button" onClick={() => { setRenaming(screen.id); setName(screen.name); }}>重命名 {screen.name}</button><button type="button" onClick={() => { void repository.removeScreen(screen.id, screen.version).then(refresh); }}>删除 {screen.name}</button>{renaming === screen.id && <span><label>重命名输入<input aria-label="重命名输入" value={name} onChange={(event) => setName(event.target.value)} /></label><button type="button" onClick={() => { void repository.renameScreen(screen.id, name, screen.version).then(() => { setRenaming(null); return refresh(); }); }}>确认重命名</button></span>}</article>)}</section>;
}
