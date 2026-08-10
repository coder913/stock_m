export type LedgerEventType = "buy" | "sell" | "dividend" | "fee" | "deposit" | "withdrawal" | "split";
export interface LedgerEvent { id: string; type: LedgerEventType; symbol?: string; occurredAt: string; quantity?: number; price?: number; amount?: number; thesisVersionId?: string; reason?: string; oldRate?: number; newRate?: number; quantityMultiplier?: number; source?: "alpaca" | "manual"; sourceEventId?: string; confirmedAt?: string; }
export type LedgerEventInput = Omit<LedgerEvent, "id">;
export interface MigrationResult { migrated: number; skipped: boolean; }
export interface PortfolioSettings { version: 1; initialCash: number; inceptionDate: string; benchmarkSymbol: string; baseCurrency: "USD"; updatedAt: string; }
export interface IgnoredSplitDecision { sourceEventId: string; symbol: string; note: string; ignoredAt: string; }
export interface PortfolioQuote { price: number; previousClose: number; }
export interface PositionSnapshot { symbol: string; quantity: number; averageCost: number; marketPrice?: number; marketValue?: number; realizedPnl: number; unrealizedPnl?: number; weight?: number; sector: string; }
export interface PortfolioAnalyticsInput { events: LedgerEvent[]; initialCash: number; quotes: Record<string, PortfolioQuote>; sectors: Record<string, string>; history: number[]; }
export interface PortfolioAnalyticsResult { positions: PositionSnapshot[]; cash: number; totalValue?: number; cumulativePnl?: number; sectorExposure: Record<string, number>; topFiveConcentration?: number; drawdown: { current: number; maximum: number }; }
export type AlertSeverity = "info" | "warning" | "critical"; export type AlertStatus = "open" | "snoozed" | "resolved";
export interface AlertCandidate { dedupeKey: string; rule: string; severity: AlertSeverity; symbol?: string; message: string; currentValue: number | string; threshold: number | string; }
export interface PortfolioAlert extends AlertCandidate { id: string; status: AlertStatus; createdAt: string; updatedAt: string; snoozedUntil?: string; resolvedAt?: string; }
export type PortfolioAlertActionInput = { type: "acknowledge" | "resolve" } | { type: "snooze"; until: string };
export interface PortfolioSnapshot { id: string; asOf: string; positions: PositionSnapshot[]; cash: number; totalValue?: number; cumulativePnl?: number; drawdownPercent?: number; sectorExposure: Record<string, number>; quoteSource?: string; quoteAsOf?: string; quoteStale?: boolean; }
export interface WeeklyReviewInput { week: string; snapshot: Omit<PortfolioSnapshot, "id">; events: LedgerEvent[]; alerts: PortfolioAlert[]; judgment: string; action: string; result: string; nextObservations: string[]; }
export interface WeeklyReview { id: string; week: string; version: number; snapshotId: string; judgment: string; action: string; result: string; nextObservations: string[]; createdAt: string; summary: { tradeCount: number; openAlertCount: number }; }
export interface ReviewDiff { totalValueChange?: number; changedFields: string[]; }
export interface PortfolioBootstrap { revision: number; settings: PortfolioSettings; events: LedgerEvent[]; ignoredSplits: IgnoredSplitDecision[]; alerts: PortfolioAlert[]; reviews: WeeklyReview[]; }
