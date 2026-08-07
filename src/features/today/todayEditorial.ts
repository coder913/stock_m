import type { TodayDashboard } from "../market/domain";

const baseSignal = {
  symbol: "NVDA", name: "英伟达", price: 0, change: 0, changePercent: 0, strength: 4 as const, trigger: "数据中心需求上修",
  reasons: ["资本开支指引上修", "供应链交付改善", "量能温和放大"] as [string, string, string],
  relatedEvents: [], series: [],
};
export const todayEditorial: TodayDashboard = {
  asOf: "", freshness: { kind: "delayed", minutes: 15 }, pulses: [],
  signals: [baseSignal, { ...baseSignal, symbol: "AAPL", name: "苹果公司", trigger: "服务营收超预期" }, { ...baseSignal, symbol: "MSFT", name: "微软", trigger: "Azure 增长观察" }],
  weekEvents: [], thesisCheck: { symbol: "NVDA", coreJudgment: "数据中心需求支持增长", evidence: "资本开支指引", risk: "供应链交付", validation: "下一财季收入" },
};
