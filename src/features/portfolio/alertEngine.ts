import type { AlertCandidate, AlertSeverity } from "./domain";

export interface AlertEvaluationInput { naturalPeriod: string; positions: Array<{ symbol: string; weight?: number }>; sectorExposure: Record<string, number>; drawdownPercent: number; }
const severityFor = (value: number, warning: number, critical: number): AlertSeverity | undefined => value >= critical ? "critical" : value >= warning ? "warning" : undefined;

export function evaluatePortfolioAlerts(input: AlertEvaluationInput): AlertCandidate[] {
  const result: AlertCandidate[] = [];
  for (const position of input.positions) { const severity = position.weight === undefined ? undefined : severityFor(position.weight, 20, 30); if (severity) result.push({ dedupeKey: `position-concentration:${position.symbol}:${input.naturalPeriod}`, rule: "position-concentration", severity, symbol: position.symbol, message: `${position.symbol} 仓位集中`, currentValue: position.weight!, threshold: severity === "critical" ? 30 : 20 }); }
  for (const [sector, exposure] of Object.entries(input.sectorExposure)) { const severity = severityFor(exposure, 35, 45); if (severity) result.push({ dedupeKey: `sector-concentration:${sector}:${input.naturalPeriod}`, rule: "sector-concentration", severity, message: `${sector} 行业暴露集中`, currentValue: exposure, threshold: severity === "critical" ? 45 : 35 }); }
  const drawdownSeverity = severityFor(input.drawdownPercent, 10, 15); if (drawdownSeverity) result.push({ dedupeKey: `portfolio-drawdown:portfolio:${input.naturalPeriod}`, rule: "portfolio-drawdown", severity: drawdownSeverity, message: "组合回撤超限", currentValue: input.drawdownPercent, threshold: drawdownSeverity === "critical" ? 15 : 10 });
  return result;
}
