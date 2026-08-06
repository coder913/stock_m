import { useEffect, useMemo, useState } from "react";
import type { ScreenerCondition, ScreenerMetric, ScreenerTemplate, StockSnapshot } from "./domain";
import { mockDiscoveryRepository } from "./mockDiscoveryRepository";
import { SavedScreenRepository } from "./savedScreenRepository";
import { runScreen } from "./screener";
import { ScreenerPanel } from "./ScreenerPanel";
import { ScreenerResults } from "./ScreenerResults";
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
  useEffect(() => { void mockDiscoveryRepository.listStocks().then((result) => setStocks(result.items)); }, []);
  const results = useMemo(() => runScreen(stocks, conditions).sort((left, right) => ((left.metrics[sort.metric] ?? -Infinity) - (right.metrics[sort.metric] ?? -Infinity)) * (sort.direction === "asc" ? 1 : -1)), [conditions, sort, stocks]);
  const selectTemplate = (template: ScreenerTemplate) => { setSelectedTemplate(template); setConditions(copyConditions(template.conditions)); };
  const changeCondition = (id: string, value: number) => setConditions((current) => current.map((condition) => condition.id === id ? { ...condition, value } : condition));
  const save = () => { try { new SavedScreenRepository(localStorage).save({ name: screenName || selectedTemplate.name, conditions, sort }); setMessage("筛选已保存"); setScreenName(""); } catch { setMessage("保存失败，请重试"); } };
  return <section className="discovery-page">
    <header><p className="freshness">模拟数据 · 延迟 15 分钟</p><h1>发现</h1><p>用可解释条件寻找候选股票，而非生成买卖建议。</p></header>
    <nav className="discovery-tabs" aria-label="发现功能"><button type="button" aria-current="page">策略选股</button><button type="button">市场主题</button><button type="button">财报日历</button><button type="button">已保存筛选</button></nav>
    <div className="discovery-layout"><ScreenerPanel templates={systemTemplates} conditions={conditions} onTemplateSelect={selectTemplate} onConditionValueChange={changeCondition} />
      <div className="screener-main"><div className="screener-toolbar"><strong>{results.length} 个匹配结果</strong><label>排序<select value={`${sort.metric}:${sort.direction}`} onChange={(event) => { const [metric, direction] = event.target.value.split(":") as [ScreenerMetric, "asc" | "desc"]; setSort({ metric, direction }); }}><option value="revenueGrowthYoY:desc">营收增长（高到低）</option><option value="price:asc">价格（低到高）</option></select></label></div>
      <div className="save-screen"><label>筛选名称<input value={screenName} onChange={(event) => setScreenName(event.target.value)} /></label><button type="button" onClick={save}>保存筛选</button><p role="status">{message}</p></div>
      <ScreenerResults stocks={results} onAddToWatchlist={onAddToWatchlist} /></div></div>
  </section>;
}
