export type ScreenerOperator = ">" | ">=" | "<" | "<=" | "=" | "between";
export type ScreenerPeriod = "CURRENT" | "MRQ" | "TTM" | "FY1";
export type ScreenerMetric = "price" | "dailyChangePercent" | "revenueGrowthYoY" | "epsGrowthYoY"
  | "grossMarginVsIndustryMedian" | "freeCashFlow" | "forwardPE" | "forwardPEToIndustryMedian"
  | "peg" | "freeCashFlowYield" | "netDebtToEbitda" | "earningsSurprise" | "nextFyEpsRevision30d"
  | "grossMarginYoYChange" | "priceVs20DayHigh" | "relativeVolume" | "averageDollarVolume20d"
  | "marketCap" | "operatingMargin" | "return3Months" | "beta";

export interface ScreenerCondition {
  id: string;
  metric: ScreenerMetric;
  operator: ScreenerOperator;
  value: number | readonly [number, number];
  period: ScreenerPeriod;
}

export interface SavedScreenInput {
  name: string;
  conditions: ScreenerCondition[];
  sort: { metric: ScreenerMetric; direction: "asc" | "desc" };
}

export interface SavedScreen extends SavedScreenInput {
  id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface UserUniverseState {
  addedSymbols: string[];
  removedDefaultSymbols: string[];
  version: number;
}

export interface AsyncDiscoveryStateRepository {
  getUniverseState(): Promise<UserUniverseState>;
  addUniverseSymbol(symbol: string, version: number, idempotencyKey?: string): Promise<UserUniverseState>;
  removeUniverseSymbol(symbol: string, version: number, idempotencyKey?: string): Promise<UserUniverseState>;
  restoreUniverseSymbol(symbol: string, version: number, idempotencyKey?: string): Promise<UserUniverseState>;
  listScreens(): Promise<SavedScreen[]>;
  createScreen(input: SavedScreenInput, idempotencyKey?: string): Promise<SavedScreen>;
  renameScreen(id: string, name: string, version: number, idempotencyKey?: string): Promise<SavedScreen>;
  duplicateScreen(id: string, idempotencyKey?: string): Promise<SavedScreen>;
  removeScreen(id: string, version: number, idempotencyKey?: string): Promise<void>;
}
