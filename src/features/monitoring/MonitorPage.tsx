import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ConditionRepository } from "./conditionRepository";
import { ConditionTimeline } from "./ConditionTimeline";
import type { ConditionSeverity, ConditionStatus, MonitorAlert, ThesisReview } from "./domain";
import { EvaluationRepository } from "./evaluationRepository";
import { MonitorAlertRepository } from "./monitorAlertRepository";
import { ThesisReviewRepository } from "./thesisReviewRepository";

const currentTime = () => new Date().toISOString();
type InboxView = "pending" | "snoozed" | "archived";

export function MonitorPage({ alertRepository: injectedAlerts, reviewRepository: injectedReviews, conditionRepository: injectedConditions, evaluationRepository: injectedEvaluations, now = currentTime }: { alertRepository?: MonitorAlertRepository; reviewRepository?: ThesisReviewRepository; conditionRepository?: ConditionRepository; evaluationRepository?: EvaluationRepository; now?: () => string }) {
  const repositories = useMemo(() => ({ alerts: injectedAlerts ?? new MonitorAlertRepository(localStorage), reviews: injectedReviews ?? new ThesisReviewRepository(localStorage), conditions: injectedConditions ?? new ConditionRepository(localStorage), evaluations: injectedEvaluations ?? new EvaluationRepository(localStorage) }), [injectedAlerts, injectedReviews, injectedConditions, injectedEvaluations]);
  const [view, setView] = useState<InboxView>("pending");
  const [symbol, setSymbol] = useState(""); const [severity, setSeverity] = useState<"" | ConditionSeverity>(""); const [toStatus, setToStatus] = useState<"" | ConditionStatus>(""); const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [version, setVersion] = useState(0);
  const [selectedId, setSelectedId] = useState<string>();
  const [decision, setDecision] = useState<ThesisReview["decision"]>("reaffirmed");
  const [note, setNote] = useState(""); const [message, setMessage] = useState("");
  const time = now();
  const allAlerts = (["pending", "snoozed", "archived"] as const).flatMap((item) => repositories.alerts.list({ view: item, now: time }));
  const symbols = [...new Set(allAlerts.map((alert) => alert.symbol))].sort();
  const alerts = repositories.alerts.list({ view, now: time, symbol: symbol || undefined, severity: severity || undefined, toStatus: toStatus || undefined, from: from || undefined, to: to || undefined });
  const activeAlert = alerts.find((alert) => alert.id === selectedId) ?? alerts[0];
  const refresh = () => setVersion((item) => item + 1);
  void version;

  const saveReview = () => {
    if (!activeAlert) return;
    if ((decision === "invalidated" || decision === "archived") && !note.trim()) { setMessage("失效或归档必须填写复核备注"); return; }
    const conditionViews = repositories.conditions.listForThesis(activeAlert.thesisVersionId).map((condition) => ({ condition, evaluation: repositories.evaluations.latest(condition.id) }));
    repositories.reviews.record({ thesisVersionId: activeAlert.thesisVersionId, symbol: activeAlert.symbol, decision, note: note.trim() || undefined, conditionSnapshot: conditionViews.length ? conditionViews.map(({ condition, evaluation }) => ({ conditionId: condition.id, conditionVersion: condition.conditionVersion!, name: condition.name, severity: condition.severity, status: evaluation?.status ?? "pending" })) : [{ conditionId: activeAlert.conditionId, conditionVersion: activeAlert.conditionVersion, name: activeAlert.title, severity: activeAlert.severity, status: activeAlert.toStatus }], createdAt: now() });
    setMessage("复核已保存"); refresh();
  };

  return <section className="monitor-page"><h1>投资逻辑监控</h1>
    <div role="tablist" aria-label="监控提醒视图"><button type="button" role="tab" aria-selected={view === "pending"} onClick={() => setView("pending")}>待处理</button><button type="button" role="tab" aria-selected={view === "snoozed"} onClick={() => setView("snoozed")}>稍后处理</button><button type="button" role="tab" aria-selected={view === "archived"} onClick={() => setView("archived")}>已归档</button></div>
    <div className="monitor-filters"><label>股票<select value={symbol} onChange={(event) => setSymbol(event.target.value)}><option value="">全部</option>{symbols.map((item) => <option value={item} key={item}>{item}</option>)}</select></label><label>严重程度<select value={severity} onChange={(event) => setSeverity(event.target.value as "" | ConditionSeverity)}><option value="">全部</option><option value="high">高</option><option value="medium">中</option><option value="low">低</option></select></label><label>状态变化<select value={toStatus} onChange={(event) => setToStatus(event.target.value as "" | ConditionStatus)}><option value="">全部</option><option value="breached">受损</option><option value="expired">已过期</option><option value="confirmed">恢复成立</option></select></label><label>开始日期<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label>结束日期<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label></div>
    <div className="monitor-inbox">{alerts.length ? alerts.map((alert) => <AlertCard key={alert.id} alert={alert} selected={activeAlert?.id === alert.id} onSelect={() => setSelectedId(alert.id)} onRead={() => { repositories.alerts.markRead(alert.id, now()); refresh(); }} onArchive={() => { repositories.alerts.archive(alert.id, now()); refresh(); }} />) : <p>{view === "pending" ? "待处理视图暂无提醒" : view === "snoozed" ? "稍后处理视图暂无提醒" : "已归档视图暂无提醒"}</p>}</div>
    {activeAlert && <section className="monitor-detail"><h2>{activeAlert.symbol} 条件时间线</h2><ConditionTimeline evaluations={repositories.evaluations.list(activeAlert.conditionId)} reviews={repositories.reviews.list(activeAlert.thesisVersionId)} /><div className="monitor-actions"><button type="button" aria-label={`确认 ${activeAlert.symbol} 逻辑仍成立`} onClick={() => setDecision("reaffirmed")}>确认逻辑仍成立</button><button type="button" aria-label={`标记 ${activeAlert.symbol} 逻辑失效`} onClick={() => setDecision("invalidated")}>标记逻辑失效</button><button type="button" aria-label={`归档 ${activeAlert.symbol} 逻辑`} onClick={() => setDecision("archived")}>归档逻辑</button></div><label>复核备注<textarea value={note} onChange={(event) => setNote(event.target.value)} /></label><button type="button" onClick={saveReview}>保存复核</button><p role="status">{message}</p></section>}
  </section>;
}

function AlertCard({ alert, selected, onSelect, onRead, onArchive }: { alert: MonitorAlert; selected: boolean; onSelect: () => void; onRead: () => void; onArchive: () => void }) {
  return <article className={`monitor-alert-card${selected ? " is-selected" : ""}`}><button type="button" className="monitor-alert-select" onClick={onSelect}><strong>{alert.title}</strong><span>{alert.explanation}</span></button><p>{alert.severity} · {alert.fromStatus ?? "pending"} → {alert.toStatus} · {new Date(alert.createdAt).toLocaleString()}</p><div className="monitor-actions"><Link to={`/stocks/${alert.symbol}`}>复核 {alert.symbol}</Link>{!alert.readAt && <button type="button" onClick={onRead}>标记已读</button>}<button type="button" aria-label={`归档 ${alert.title}`} onClick={onArchive}>归档</button></div></article>;
}
