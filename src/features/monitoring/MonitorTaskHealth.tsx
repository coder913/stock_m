import type { MonitorTaskHealthView } from "./domain";

const labels = { price: "价格", financial: "财务", event: "事件" } as const;
export function MonitorTaskHealth({ health }: { health: MonitorTaskHealthView }) {
  const worker = health.worker;
  return <section className="monitor-task-health" aria-labelledby="monitor-task-health-title"><h2 id="monitor-task-health-title">后台任务健康</h2>
    <p>{worker ? `Worker ${worker.state === "ready" ? "正常" : worker.state === "degraded" ? "降级" : worker.state} · 队列积压 ${worker.queueLag}` : "Worker 尚无心跳"}</p>
    <ul>{health.groups.map((group) => <li key={group.type}><strong>{labels[group.type]}</strong> · 上次成功 {group.lastSuccess ?? "暂无"} · 下次运行 {group.nextRun ?? "等待调度"}{group.dataState && group.dataState !== "fresh" ? " · 等待新数据" : ""}</li>)}</ul>
  </section>;
}
