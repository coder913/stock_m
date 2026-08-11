import { lazy, Suspense, useState } from "react";
import type { PerformanceRange, PerformanceViewModel } from "./performance/domain";
import { PerformanceAttributionTable } from "./PerformanceAttributionTable";
import { PerformanceSummary } from "./PerformanceSummary";
import { SplitReviewPanel, type ConfirmedSplitInput } from "./SplitReviewPanel";
import type { MarketEvent } from "../market/apiDomain";

const PerformanceChart = lazy(() => import("./PerformanceChart").then((module) => ({ default: module.PerformanceChart })));

interface PortfolioPerformanceTabProps {
  model: PerformanceViewModel;
  range: PerformanceRange;
  benchmark: string;
  mode?: "editable" | "paper-readonly";
  quantities?: Record<string, number>;
  onRangeChange: (range: PerformanceRange) => void;
  onBenchmarkSave?: (symbol: string) => Promise<void>;
  onRefresh: () => void;
  onConfigure?: () => void;
  onConfirmSplit?: (input: ConfirmedSplitInput) => void;
  onIgnoreSplit?: (event: MarketEvent, note: string) => void;
  onManualSplit?: (input: ConfirmedSplitInput) => void;
}

export function PortfolioPerformanceTab({
  model,
  range,
  benchmark,
  mode = "editable",
  quantities = {},
  onRangeChange,
  onBenchmarkSave,
  onRefresh,
  onConfigure,
  onConfirmSplit,
  onIgnoreSplit,
  onManualSplit,
}: PortfolioPerformanceTabProps) {
  const editable = mode === "editable";
  const [benchmarkChoice, setBenchmarkChoice] = useState(["SPY", "QQQ", "DIA", "IWM"].includes(benchmark) ? benchmark : "custom");
  const [customBenchmark, setCustomBenchmark] = useState("");
  const [customOpen, setCustomOpen] = useState(range.kind === "custom");
  const [from, setFrom] = useState(range.kind === "custom" ? range.from : "");
  const [to, setTo] = useState(range.kind === "custom" ? range.to : "");
  const [error, setError] = useState("");
  const saveBenchmark = async () => {
    if (!onBenchmarkSave) return;
    const next = benchmarkChoice === "custom" ? customBenchmark.trim().toUpperCase() : benchmarkChoice;
    try { await onBenchmarkSave(next); setError(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "基准保存失败"); }
  };
  const applyCustom = () => {
    if (!from || !to || from > to) { setError("开始日期不能晚于结束日期"); return; }
    onRangeChange({ kind: "custom", from, to });
    setError("");
  };
  const notices = editable && model.pendingSplits.length
    ? model.notices.filter((notice) => notice !== "未确认拆股会阻断生效日后的绩效")
    : model.notices;

  return <section className="performance-workspace">
    <header>
      <div><h2>绩效分析</h2><p>{benchmark} · {model.dataState === "stale" ? "旧缓存" : model.dataState === "fresh" ? "数据已更新" : "部分数据不可用"}</p></div>
      {editable && <button type="button" onClick={onConfigure}>配置组合</button>}
      <button type="button" onClick={onRefresh}>刷新绩效</button>
    </header>
    <div className="performance-controls">
      {(["inception", "ytd", "1y", "6m", "3m"] as const).map((kind) => <button type="button" key={kind} onClick={() => onRangeChange({ kind })}>{kind === "inception" ? "成立以来" : kind === "ytd" ? "年初至今" : kind === "1y" ? "1 年" : kind === "6m" ? "6 个月" : "3 个月"}</button>)}
      <button type="button" onClick={() => setCustomOpen(true)}>自定义</button>
      {customOpen && <span><label>开始日期<input aria-label="开始日期" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label>结束日期<input aria-label="结束日期" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label><button type="button" onClick={applyCustom}>应用区间</button></span>}
      {editable ? <>
        <label>比较基准<select aria-label="比较基准" value={benchmarkChoice} onChange={(event) => { const choice = event.target.value; setBenchmarkChoice(choice); if (choice !== "custom" && onBenchmarkSave) void onBenchmarkSave(choice).then(() => setError("")).catch((reason) => setError(reason instanceof Error ? reason.message : "基准保存失败")); }}><option value="SPY">SPY</option><option value="QQQ">QQQ</option><option value="DIA">DIA</option><option value="IWM">IWM</option><option value="custom">自定义</option></select></label>
        {benchmarkChoice === "custom" && <label>自定义基准代码<input aria-label="自定义基准代码" value={customBenchmark} onChange={(event) => setCustomBenchmark(event.target.value)} /></label>}
        <button type="button" onClick={() => void saveBenchmark()}>应用基准</button>
      </> : <span>比较基准 {benchmark}</span>}
    </div>
    {error && <p role="alert">{error}</p>}
    {editable && onConfirmSplit && onIgnoreSplit && onManualSplit && <SplitReviewPanel candidates={model.pendingSplits} quantities={quantities} onConfirm={onConfirmSplit} onIgnore={onIgnoreSplit} onManual={onManualSplit} />}
    {notices.map((notice) => <p key={notice} className="performance-notice">{notice}</p>)}
    {model.result ? <>
      <PerformanceSummary summary={model.result.summary} />
      <table aria-label="绩效现金流"><thead><tr><th>现金流项目</th><th>金额</th></tr></thead><tbody><tr><th>期初资金</th><td>{model.result.interval.beginningValue.toFixed(2)}</td></tr><tr><th>区间入金</th><td>{model.result.interval.deposits.toFixed(2)}</td></tr><tr><th>区间出金</th><td>{model.result.interval.withdrawals.toFixed(2)}</td></tr></tbody></table>
      <Suspense fallback={<p>图表加载中</p>}><PerformanceChart points={model.result.points} /></Suspense>
      <PerformanceAttributionTable attribution={model.attribution} />
    </> : <p>绩效暂不可用</p>}
  </section>;
}
