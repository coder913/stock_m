import { useEffect, useMemo, useState } from "react";
import type { ScreenerCondition, ScreenerMetric, ScreenerTemplate, StockSnapshot } from "./domain";
import { mockDiscoveryRepository } from "./mockDiscoveryRepository";
import { SavedScreenRepository } from "./savedScreenRepository";
import { runScreen } from "./screener";
import { ScreenerPanel } from "./ScreenerPanel";
import { ScreenerResults } from "./ScreenerResults";
import { ThemeView } from "./ThemeView";
import { EventCalendar } from "./EventCalendar";
import { systemTemplates } from "./templates";
import "./discovery.css";

const copyConditions = (conditions: readonly ScreenerCondition[]): ScreenerCondition[] => conditions.map((condition) => ({ ...condition, value: Array.isArray(condition.value) ? [...condition.value] as [number, number] : condition.value }));
interface DiscoveryPageProps { onAddToWatchlist?: (symbol: string) => void; }

export function DiscoveryPage({ onAddToWatchlist = () => undefined }: DiscoveryPageProps) {
  const [stocks, setStocks] = useState<StockSnapshot[]>([]);
  const [conditions, setConditions] = useState<ScreenerCondition[]>(() => copyConditions(systemTemplates[0].conditions));
  const [selectedTemplate, setSelectedTemplate] = useState<ScreenerTemplate>(systemTemplates[0]);
  const [sort, setSort] = useState<{ metric: ScreenerMetric; direction: "asc" | "desc" }>({ metric: "revenueGrowthYoY", direction: "desc" });
  const [screenName, setScreenName] = useState("");
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState<"screen" | "themes" | "calendar" | "saved">("screen");
  const [themes, setThemes] = useState<Awaited<ReturnType<typeof mockDiscoveryRepository.listThemes>>["items"]>([]);
  const [events, setEvents] = useState<Awaited<ReturnType<typeof mockDiscoveryRepository.listEvents>>["items"]>([]);
  useEffect(() => { void mockDiscoveryRepository.listStocks().then((result) => setStocks(result.items)); }, []);
  useEffect(() => { void mockDiscoveryRepository.listThemes().then((result) => setThemes(result.items)); void mockDiscoveryRepository.listEvents().then((result) => setEvents(result.items)); }, []);
  const results = useMemo(() => runScreen(stocks, conditions).sort((left, right) => ((left.metrics[sort.metric] ?? -Infinity) - (right.metrics[sort.metric] ?? -Infinity)) * (sort.direction === "asc" ? 1 : -1)), [conditions, sort, stocks]);
  const selectTemplate = (template: ScreenerTemplate) => { setSelectedTemplate(template); setConditions(copyConditions(template.conditions)); };
  const changeCondition = (id: string, value: number) => setConditions((current) => current.map((condition) => condition.id === id ? { ...condition, value } : condition));
  const save = () => { try { new SavedScreenRepository(localStorage).save({ name: screenName || selectedTemplate.name, conditions, sort }); setMessage("筛选已保存"); setScreenName(""); } catch { setMessage("保存失败，请重试"); } };
  return <section className="discovery-page">
    <header><p className="freshness">模拟数据 · 延迟 15 分钟</p><h1>发现</h1><p>用可解释条件寻找候选股票，而非生成买卖建议。</p></header>
    <nav className="discovery-tabs" aria-label="发现功能"><button type="button" aria-current={tab === "screen" ? "page" : undefined} onClick={() => setTab("screen")}>策略选股</button><button type="button" aria-current={tab === "themes" ? "page" : undefined} onClick={() => setTab("themes")}>市场主题</button><button type="button" aria-current={tab === "calendar" ? "page" : undefined} onClick={() => setTab("calendar")}>财报日历</button><button type="button" aria-current={tab === "saved" ? "page" : undefined} onClick={() => setTab("saved")}>已保存筛选</button></nav>
    {tab === "themes" ? <ThemeView themes={themes} /> : tab === "calendar" ? <EventCalendar events={events} /> : tab === "saved" ? <SavedScreens onRun={(conditions) => { setConditions(conditions); setTab("screen"); }} /> : <div className="discovery-layout"><ScreenerPanel templates={systemTemplates} conditions={conditions} onTemplateSelect={selectTemplate} onConditionValueChange={changeCondition} />
      <div className="screener-main"><div className="screener-toolbar"><strong>{results.length} 个匹配结果</strong><label>排序<select value={`${sort.metric}:${sort.direction}`} onChange={(event) => { const [metric, direction] = event.target.value.split(":") as [ScreenerMetric, "asc" | "desc"]; setSort({ metric, direction }); }}><option value="revenueGrowthYoY:desc">营收增长（高到低）</option><option value="price:asc">价格（低到高）</option></select></label></div>
      <div className="save-screen"><label>筛选名称<input value={screenName} onChange={(event) => setScreenName(event.target.value)} /></label><button type="button" onClick={save}>保存筛选</button><p role="status">{message}</p></div>
      <ScreenerResults stocks={results} onAddToWatchlist={onAddToWatchlist} /></div></div>}
  </section>;
}

function SavedScreens({ onRun }: { onRun(conditions: ScreenerCondition[]): void }) {
  const [screens, setScreens] = useState(() => new SavedScreenRepository(localStorage).list());
  const refresh = () => setScreens(new SavedScreenRepository(localStorage).list());
  if (!screens.length) return <p role="status">尚未保存筛选条件。</p>;
  return <section><h2>已保存筛选</h2>{screens.map((screen) => <article key={screen.id}><strong>{screen.name}</strong><button type="button" onClick={() => onRun(copyConditions(screen.conditions))}>运行</button><button type="button" onClick={() => { new SavedScreenRepository(localStorage).remove(screen.id); refresh(); }}>删除</button></article>)}</section>;
}
