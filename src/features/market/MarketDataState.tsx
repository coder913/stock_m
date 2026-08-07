import type { ReactNode } from "react";
import type { DataEnvelope } from "./apiDomain";
import "./marketDataState.css";
export function MarketDataState<T>({ envelope, error, onRetry, children }: { envelope?: DataEnvelope<T>; error: unknown; onRetry: () => void; children?: ReactNode }) { if (error && !envelope) return <div role="alert" className="market-data-error">数据暂不可用 <button onClick={onRetry}>重试</button></div>; return <><div className="market-data-state">{envelope?.stale && <span>旧缓存</span>}{envelope?.delayMinutes && <span>延迟 {envelope.delayMinutes} 分钟</span>}{envelope && <span>数据时间 {new Date(envelope.asOf).toLocaleString()}</span>}{envelope?.notices.map((notice) => <span key={notice}>{notice}</span>)}</div>{children}</>; }
