import type { InstrumentResearch, TodayDashboard } from "./domain";
import type { MarketRepository } from "./marketRepository";

const nvda = {
  symbol: "NVDA", name: "英伟达", price: 167.32, change: 4.74, changePercent: 2.91,
  strength: 4 as const, trigger: "数据中心需求上修",
  reasons: ["多家云厂商上调 AI 基础设施资本开支指引。", "供应链显示高端 GPU 交付节奏改善。", "价格回落至 20 日均线附近且量能温和放大。"] as [string, string, string],
  relatedEvents: [{ date: "2026-07-28", label: "目标价上调", source: "Piper Sandler" }],
  series: [161, 163, 166, 169, 172, 170, 167]
};

const todayFixture: TodayDashboard = {
  asOf: "2026-08-04T07:30:00-04:00", freshness: { kind: "delayed", minutes: 15 },
  pulses: [
    { symbol: "SPY", name: "标普 500 ETF", price: 637.21, change: 3.21, changePercent: 0.51, series: [632, 634, 635, 637] },
    { symbol: "QQQ", name: "纳斯达克 100 ETF", price: 567.83, change: 4.47, changePercent: 0.79, series: [561, 563, 566, 568] },
    { symbol: "DIA", name: "道琼斯 ETF", price: 447.1, change: 1.34, changePercent: 0.3, series: [444, 445, 446, 447] },
    { symbol: "VIX", name: "波动率指数", price: 14.12, change: 0.45, changePercent: 3.21, series: [13.4, 13.8, 14.4, 14.1] }
  ],
  signals: [nvda,
    { ...nvda, symbol: "AAPL", name: "苹果公司", price: 218.72, change: -1.89, changePercent: -0.86, strength: 4, trigger: "服务营收超预期", series: [217, 220, 219, 218] },
    { ...nvda, symbol: "MSFT", name: "微软", price: 505.41, change: 5.41, changePercent: 1.08, strength: 3, trigger: "Azure 增长放缓担忧缓解", series: [498, 501, 503, 505] }],
  weekEvents: [{ date: "08-06", session: "盘后", symbol: "AMZN", label: "2026 Q2 财报" }],
  thesisCheck: { symbol: "NVDA", coreJudgment: "数据中心需求支持增长", evidence: "资本开支指引上修", risk: "供应链交付延迟", validation: "下一财季收入继续增长" }
};

const researchFixtures: Record<string, InstrumentResearch> = {
  NVDA: { quote: nvda, asOf: todayFixture.asOf, freshness: todayFixture.freshness, priceSeries: nvda.series.map((value, index) => ({ date: `2026-07-${29 + index}`, value })), financials: [{ year: "FY2024", revenue: 609, eps: 11.93 }, { year: "FY2025", revenue: 1305, eps: 29.76 }], valuation: { low: 120, midpoint: 180, high: 240, current: 167.32 }, evidence: [{ date: "2026-07-28", category: "研究", text: nvda.reasons[0], source: "Piper Sandler" }] }
};

const clone = <T,>(value: T): T => structuredClone(value);

export const mockMarketRepository: MarketRepository = {
  async getToday() { return clone(todayFixture); },
  async getInstrument(symbol) {
    const item = researchFixtures[symbol.toUpperCase()];
    if (!item) throw new Error(`未找到股票 ${symbol}`);
    return clone(item);
  }
};
