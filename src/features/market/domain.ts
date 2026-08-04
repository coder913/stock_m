export type Freshness =
  | { kind: "realtime" }
  | { kind: "delayed"; minutes: number }
  | { kind: "close"; date: string }
  | { kind: "simulated" };

export interface Quote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
}

export interface MarketPulse extends Quote { series: number[]; }

export interface Signal extends Quote {
  strength: 1 | 2 | 3 | 4 | 5;
  trigger: string;
  reasons: [string, string, string];
  relatedEvents: Array<{ date: string; label: string; source: string }>;
  series: number[];
}

export interface WeekEvent { date: string; session: "盘前" | "盘后"; symbol: string; label: string; }

export interface ThesisCheck {
  symbol: string;
  coreJudgment: string;
  evidence: string;
  risk: string;
  validation: string;
}

export interface TodayDashboard {
  asOf: string;
  freshness: Freshness;
  pulses: MarketPulse[];
  signals: Signal[];
  weekEvents: WeekEvent[];
  thesisCheck: ThesisCheck;
}

export interface InstrumentResearch {
  quote: Quote;
  asOf: string;
  freshness: Freshness;
  priceSeries: Array<{ date: string; value: number }>;
  financials: Array<{ year: string; revenue: number; eps: number }>;
  valuation: { low: number; midpoint: number; high: number; current: number };
  evidence: Array<{ date: string; category: string; text: string; source: string }>;
}
