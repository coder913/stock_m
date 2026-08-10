import { useState } from "react";
import type { PortfolioSettings } from "./domain";

export function PortfolioSettingsDialog({ settings, hasEvents, onSave, onClose }: { settings: PortfolioSettings; hasEvents: boolean; onSave: (input: Omit<PortfolioSettings, "version" | "updatedAt">) => void; onClose: () => void }) {
  const [initialCash, setInitialCash] = useState(String(settings.initialCash));
  const [inceptionDate, setInceptionDate] = useState(settings.inceptionDate);
  const save = () => { if (hasEvents && (Number(initialCash) !== settings.initialCash || inceptionDate !== settings.inceptionDate) && !window.confirm("将重新计算全部历史绩效")) return; onSave({ initialCash: Number(initialCash), inceptionDate, benchmarkSymbol: settings.benchmarkSymbol, baseCurrency: "USD" }); };
  return <div role="dialog" aria-label="配置组合"><h2>配置组合</h2><label>初始资金<input aria-label="初始资金" type="number" value={initialCash} onChange={(event) => setInitialCash(event.target.value)} /></label><label>成立日期<input aria-label="成立日期" type="date" value={inceptionDate} onChange={(event) => setInceptionDate(event.target.value)} /></label><p>基础货币 USD</p><button type="button" onClick={save}>保存组合设置</button><button type="button" onClick={onClose}>取消</button></div>;
}
