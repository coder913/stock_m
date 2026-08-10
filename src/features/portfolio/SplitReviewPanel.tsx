import { useEffect, useState } from "react";
import type { MarketEvent } from "../market/apiDomain";

export interface ConfirmedSplitInput { symbol: string; oldRate: number; newRate: number; quantityMultiplier: number; effectiveDate: string; sourceEventId: string; source: "alpaca" | "manual"; }

export function SplitReviewPanel({ candidates, onConfirm, onIgnore, onManual }: { candidates: MarketEvent[]; onConfirm: (input: ConfirmedSplitInput) => void; onIgnore: (event: MarketEvent, note: string) => void; onManual: (input: ConfirmedSplitInput) => void }) {
  const candidate = candidates[0];
  const [oldRate, setOldRate] = useState(String(candidate?.split?.oldRate ?? 1));
  const [newRate, setNewRate] = useState(String(candidate?.split?.newRate ?? 1));
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [manualSymbol, setManualSymbol] = useState("");
  const [manualDate, setManualDate] = useState("");
  useEffect(() => { setOldRate(String(candidate?.split?.oldRate ?? 1)); setNewRate(String(candidate?.split?.newRate ?? 1)); }, [candidate?.id, candidate?.split?.newRate, candidate?.split?.oldRate]);
  if (!candidate) return <details><summary>手动补录拆股</summary><label>手动拆股代码<input aria-label="手动拆股代码" value={manualSymbol} onChange={(event) => setManualSymbol(event.target.value.toUpperCase())} /></label><label>手动拆股日期<input aria-label="手动拆股日期" type="date" value={manualDate} onChange={(event) => setManualDate(event.target.value)} /></label><button type="button" onClick={() => onManual({ symbol: manualSymbol, oldRate: 1, newRate: 2, quantityMultiplier: 2, effectiveDate: manualDate, sourceEventId: `manual:${crypto.randomUUID()}`, source: "manual" })}>新增手动拆股</button></details>;
  const confirm = () => { const oldValue = Number(oldRate); const newValue = Number(newRate); if (!(oldValue > 0) || !(newValue > 0)) { setError("拆股比例必须大于零"); return; } onConfirm({ symbol: candidate.symbol!, oldRate: oldValue, newRate: newValue, quantityMultiplier: newValue / oldValue, effectiveDate: candidate.split?.effectiveDate ?? candidate.scheduledAt.slice(0, 10), sourceEventId: candidate.id, source: "alpaca" }); };
  return <section className="split-review" aria-label="拆股确认"><p role="alert">未确认拆股会阻断生效日后的绩效</p><h3>{candidate.symbol} 拆股候选</h3><p>{candidate.scheduledAt.slice(0, 10)} · {candidate.source}</p><label>原股比例<input aria-label="原股比例" value={oldRate} onChange={(event) => setOldRate(event.target.value)} /></label><label>新股比例<input aria-label="新股比例" value={newRate} onChange={(event) => setNewRate(event.target.value)} /></label><button type="button" onClick={confirm}>确认 {candidate.symbol} 拆股</button><label>忽略备注<input aria-label="忽略备注" value={note} onChange={(event) => setNote(event.target.value)} /></label><button type="button" onClick={() => note.trim() ? onIgnore(candidate, note) : setError("忽略拆股必须填写备注")}>忽略 {candidate.symbol} 拆股</button>{error && <p role="alert">{error}</p>}</section>;
}
