export type LedgerEventType = "buy" | "sell" | "dividend" | "fee";

export interface LedgerEvent {
  id: string;
  type: LedgerEventType;
  symbol?: string;
  occurredAt: string;
  quantity?: number;
  price?: number;
  amount?: number;
  thesisVersionId?: string;
  reason?: string;
}

export type LedgerEventInput = Omit<LedgerEvent, "id">;
export interface MigrationResult { migrated: number; skipped: boolean; }

export interface PortfolioQuote { price: number; previousClose: number; }
export interface PositionSnapshot { symbol: string; quantity: number; averageCost: number; marketPrice?: number; marketValue?: number; realizedPnl: number; unrealizedPnl?: number; weight?: number; sector: string; }
export interface PortfolioAnalyticsInput { events: LedgerEvent[]; initialCash: number; quotes: Record<string, PortfolioQuote>; sectors: Record<string, string>; history: number[]; }
export interface PortfolioAnalyticsResult { positions: PositionSnapshot[]; cash: number; totalValue?: number; cumulativePnl?: number; sectorExposure: Record<string, number>; topFiveConcentration?: number; drawdown: { current: number; maximum: number }; }
