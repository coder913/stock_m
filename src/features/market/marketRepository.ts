import type { InstrumentResearch, TodayDashboard } from "./domain";

export interface MarketRepository {
  getToday(): Promise<TodayDashboard>;
  getInstrument(symbol: string): Promise<InstrumentResearch>;
}
