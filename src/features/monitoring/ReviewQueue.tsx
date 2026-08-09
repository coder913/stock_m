import { useState } from "react";
import { Link } from "react-router-dom";
import type { MonitorAlert } from "./domain";

const severityLabel = { high: "高", medium: "中", low: "低" } as const;
const statusLabel = { pending: "待验证", confirmed: "成立", breached: "受损", expired: "已过期" } as const;
function priority(alert: MonitorAlert): number {
  if (alert.toStatus === "breached" && alert.severity === "high") return 0;
  if (alert.toStatus === "expired") return 1;
  if (alert.toStatus === "breached" && alert.severity === "medium") return 2;
  if (alert.toStatus === "breached") return 3;
  return 4;
}

export function ReviewQueue({ alerts, onRead, onSnooze, onArchive, now = new Date().toISOString() }: { alerts: MonitorAlert[]; onRead: (id: string) => void; onSnooze: (id: string, until: string) => void; onArchive: (id: string) => void; now?: string }) {
  const [snoozingId, setSnoozingId] = useState<string>();
  const [snoozeDate, setSnoozeDate] = useState("");
  const [error, setError] = useState("");
  const ordered = [...alerts].sort((left, right) => priority(left) - priority(right) || right.createdAt.localeCompare(left.createdAt));
  if (!ordered.length) return <p>当前没有需要复核的投资逻辑。</p>;
  const confirmSnooze = () => {
    if (!snoozingId || !snoozeDate) { setError("请选择未来日期"); return; }
    const until = `${snoozeDate}T00:00:00.000Z`;
    if (until <= now) { setError("请选择未来日期"); return; }
    onSnooze(snoozingId, until);
    setSnoozingId(undefined); setSnoozeDate(""); setError("");
  };
  return <div className="review-queue">{ordered.map((alert) => <article className="review-alert" key={alert.id}>
    <header><strong>{alert.title}</strong><span>{severityLabel[alert.severity]}严重度 · {statusLabel[alert.fromStatus ?? "pending"]} → {statusLabel[alert.toStatus]}</span></header>
    <p>{alert.explanation}</p><p>数据时间：{alert.asOf ? new Date(alert.asOf).toLocaleString() : "—"} · {alert.readAt ? "已读" : "未读"}</p>
    <div className="monitor-actions"><Link to={`/stocks/${alert.symbol}`}>复核 {alert.symbol}</Link>{!alert.readAt && <button type="button" aria-label={`标记 ${alert.title}为已读`} onClick={() => onRead(alert.id)}>标记已读</button>}<button type="button" aria-label={`稍后处理 ${alert.title}`} onClick={() => { setSnoozingId(alert.id); setError(""); }}>稍后处理</button><button type="button" aria-label={`归档 ${alert.title}`} onClick={() => onArchive(alert.id)}>归档</button></div>
    {snoozingId === alert.id && <div className="snooze-form"><label>稍后处理至<input type="date" value={snoozeDate} onChange={(event) => setSnoozeDate(event.target.value)} /></label><button type="button" onClick={confirmSnooze}>确认稍后处理</button>{error && <p role="alert">{error}</p>}</div>}
  </article>)}</div>;
}
