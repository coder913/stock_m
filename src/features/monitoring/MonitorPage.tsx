import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ConditionTimeline } from "./ConditionTimeline";
import type { ConditionEvaluation, ConditionSeverity, ConditionStatus, MonitorAlert, ThesisReview } from "./domain";
import { MonitorApiRepository, type MonitorStateService } from "./monitorApiRepository";

const currentTime = () => new Date().toISOString();
type InboxView = "pending" | "snoozed" | "archived";

export function MonitorPage({ monitorState: injectedState, now = currentTime }: { monitorState?: MonitorStateService; now?: () => string }) {
  const monitorState = useMemo(() => injectedState ?? new MonitorApiRepository(), [injectedState]);
  const [view, setView] = useState<InboxView>("pending");
  const [symbol, setSymbol] = useState(""); const [severity, setSeverity] = useState<"" | ConditionSeverity>(""); const [toStatus, setToStatus] = useState<"" | ConditionStatus>(""); const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [alerts, setAlerts] = useState<MonitorAlert[]>([]); const [symbols, setSymbols] = useState<string[]>([]); const [selectedId, setSelectedId] = useState<string>();
  const [evaluations, setEvaluations] = useState<ConditionEvaluation[]>([]); const [reviews, setReviews] = useState<ThesisReview[]>([]);
  const [decision, setDecision] = useState<ThesisReview["decision"]>("reaffirmed"); const [note, setNote] = useState(""); const [message, setMessage] = useState(""); const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const time = now();
      const result = await monitorState.listAlerts({ view, now: time, symbol: symbol || undefined, severity: severity || undefined, toStatus: toStatus || undefined, from: from || undefined, to: to || undefined });
      setAlerts(result); setSelectedId((current) => result.some((item) => item.id === current) ? current : result[0]?.id); setMessage("");
      const all = (await Promise.all((["pending", "snoozed", "archived"] as const).map((item) => monitorState.listAlerts({ view: item, now: time })))).flat();
      setSymbols([...new Set(all.map((alert) => alert.symbol))].sort());
    } catch { setMessage("监控状态暂时不可用，稍后可重试"); }
    finally { setLoading(false); }
  }, [from, monitorState, now, severity, symbol, to, toStatus, view]);
  useEffect(() => { void load(); }, [load]);
  const activeAlert = alerts.find((alert) => alert.id === selectedId) ?? alerts[0];
  useEffect(() => { if (!activeAlert) { setEvaluations([]); setReviews([]); return; } let active = true; void Promise.all([monitorState.listEvaluations(activeAlert.conditionId), monitorState.listReviews(activeAlert.thesisVersionId)]).then(([nextEvaluations, nextReviews]) => { if (active) { setEvaluations(nextEvaluations); setReviews(nextReviews); } }).catch(() => { if (active) setMessage("监控时间线暂时不可用"); }); return () => { active = false; }; }, [activeAlert, monitorState]);
  const act = async (id: string, type: "read" | "archive") => { try { await monitorState.act(id, { type }); await load(); } catch { setMessage("提醒操作失败，列表未变更"); } };
  const saveReview = async () => { if (!activeAlert) return; if ((decision === "invalidated" || decision === "archived") && !note.trim()) { setMessage("失效或归档必须填写复核备注"); return; } try { await monitorState.recordReview({ thesisVersionId: activeAlert.thesisVersionId, symbol: activeAlert.symbol, decision, note: note.trim() || undefined, conditionSnapshot: [{ conditionId: activeAlert.conditionId, conditionVersion: activeAlert.conditionVersion, name: activeAlert.title, severity: activeAlert.severity, status: activeAlert.toStatus }], createdAt: now() }); setMessage("复核已保存"); setReviews(await monitorState.listReviews(activeAlert.thesisVersionId)); } catch { setMessage("复核保存失败，当前显示未变更"); } };
  return <section className="monitor-page"><h1>投资逻辑监控</h1>
    <div role="tablist" aria-label="监控提醒视图"><button type="button" role="tab" aria-selected={view === "pending"} onClick={() => setView("pending")}>待处理</button><button type="button" role="tab" aria-selected={view === "snoozed"} onClick={() => setView("snoozed")}>稍后处理</button><button type="button" role="tab" aria-selected={view === "archived"} onClick={() => setView("archived")}>已归档</button></div>
    <div className="monitor-filters"><label>股票<select value={symbol} onChange={(event) => setSymbol(event.target.value)}><option value="">全部</option>{symbols.map((item) => <option value={item} key={item}>{item}</option>)}</select></label><label>严重程度<select value={severity} onChange={(event) => setSeverity(event.target.value as "" | ConditionSeverity)}><option value="">全部</option><option value="high">高</option><option value="medium">中</option><option value="low">低</option></select></label><label>状态变化<select value={toStatus} onChange={(event) => setToStatus(event.target.value as "" | ConditionStatus)}><option value="">全部</option><option value="breached">受损</option><option value="expired">已过期</option><option value="confirmed">恢复成立</option></select></label><label>开始日期<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label>结束日期<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label></div>
    {loading && <p role="status">正在加载监控提醒</p>}<div className="monitor-inbox">{alerts.length ? alerts.map((alert) => <AlertCard key={alert.id} alert={alert} selected={activeAlert?.id === alert.id} onSelect={() => setSelectedId(alert.id)} onRead={() => { void act(alert.id, "read"); }} onArchive={() => { void act(alert.id, "archive"); }} />) : !loading && <p>{view === "pending" ? "待处理视图暂无提醒" : view === "snoozed" ? "稍后处理视图暂无提醒" : "已归档视图暂无提醒"}</p>}</div>
    {activeAlert && <section className="monitor-detail"><h2>{activeAlert.symbol} 条件时间线</h2><ConditionTimeline evaluations={evaluations} reviews={reviews} /><div className="monitor-actions"><button type="button" aria-label={`确认 ${activeAlert.symbol} 逻辑仍成立`} onClick={() => setDecision("reaffirmed")}>确认逻辑仍成立</button><button type="button" aria-label={`标记 ${activeAlert.symbol} 逻辑失效`} onClick={() => setDecision("invalidated")}>标记逻辑失效</button><button type="button" aria-label={`归档 ${activeAlert.symbol} 逻辑`} onClick={() => setDecision("archived")}>归档逻辑</button></div><label>复核备注<textarea value={note} onChange={(event) => setNote(event.target.value)} /></label><button type="button" onClick={() => void saveReview()}>保存复核</button></section>}<p role="status">{message}</p>
  </section>;
}

function AlertCard({ alert, selected, onSelect, onRead, onArchive }: { alert: MonitorAlert; selected: boolean; onSelect: () => void; onRead: () => void; onArchive: () => void }) { return <article className={`monitor-alert-card${selected ? " is-selected" : ""}`}><button type="button" className="monitor-alert-select" onClick={onSelect}><strong>{alert.title}</strong><span>{alert.explanation}</span></button><p>{alert.severity} · {alert.fromStatus ?? "pending"} → {alert.toStatus} · {new Date(alert.createdAt).toLocaleString()}</p><div className="monitor-actions"><Link to={`/stocks/${alert.symbol}`}>复核 {alert.symbol}</Link>{!alert.readAt && <button type="button" onClick={onRead}>标记已读</button>}<button type="button" aria-label={`归档 ${alert.title}`} onClick={onArchive}>归档</button></div></article>; }
