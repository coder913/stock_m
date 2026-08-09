import type { DataSource, MarketEvent } from "../market/apiDomain";

export type MonitorMetric =
  | "price"
  | "dailyChangePercent"
  | "revenueGrowthYoY"
  | "operatingMargin"
  | "freeCashFlow"
  | "freeCashFlowYield"
  | "netDebtToEbitda"
  | "earningsSurprise"
  | "grossMarginYoYChange"
  | "priceVs20DayHigh"
  | "relativeVolume"
  | "averageDollarVolume20d";

export type ConditionKind = "metric" | "event";
export type ConditionDirection = "support" | "risk";
export type ConditionSeverity = "low" | "medium" | "high";
export type ConditionStatus = "pending" | "confirmed" | "breached" | "expired";
export type EvaluationDataState = "fresh" | "missing" | "stale" | "unavailable";
export type ThesisDecisionStatus = "active" | "reaffirmed" | "invalidated" | "archived";
export type ThesisHealthStatus = "normal" | "review-needed" | "invalidated" | "archived" | "unmonitored";
export type MetricOperator = ">" | ">=" | "<" | "<=" | "between";
export type MetricPeriod = "CURRENT" | "MRQ" | "TTM";
export type EventOccurrence = "before-date" | "within-range" | "not-occurred-by-date";

export interface BaseCondition {
  id: string;
  symbol: string;
  thesisVersionId: string;
  name: string;
  direction: ConditionDirection;
  severity: ConditionSeverity;
  deadline?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  conditionVersion?: string;
}

export interface MetricCondition extends BaseCondition {
  kind: "metric";
  metric: MonitorMetric;
  operator: MetricOperator;
  target: number | readonly [number, number];
  period: MetricPeriod;
}

export interface EventCondition extends BaseCondition {
  kind: "event";
  eventType: MarketEvent["type"];
  occurrence: EventOccurrence;
  from?: string;
  to: string;
}

export type ThesisCondition = MetricCondition | EventCondition;
export type MetricConditionDraft = Omit<MetricCondition, "symbol" | "thesisVersionId" | "createdAt" | "updatedAt" | "deletedAt" | "conditionVersion">;
export type EventConditionDraft = Omit<EventCondition, "symbol" | "thesisVersionId" | "createdAt" | "updatedAt" | "deletedAt" | "conditionVersion">;
export type ConditionDraft = MetricConditionDraft | EventConditionDraft;

export interface MetricValue {
  value?: number;
  source?: DataSource;
  asOf?: string;
  dataState: EvaluationDataState;
  notices: string[];
}

export interface MonitorSnapshot {
  symbol: string;
  metrics: Partial<Record<MonitorMetric, MetricValue>>;
  events: MarketEvent[];
  eventsState: EvaluationDataState;
  eventsAsOf?: string;
  generatedAt: string;
}

export interface ConditionEvaluation {
  id: string;
  conditionId: string;
  conditionVersion: string;
  status: ConditionStatus;
  dataState: EvaluationDataState;
  actualValue?: number | string;
  targetValue?: number | readonly [number, number] | string;
  source?: DataSource;
  asOf?: string;
  explanation: string;
  evaluatedAt: string;
  changed: boolean;
  previousStatus?: ConditionStatus;
}

export interface MonitorAlert {
  id: string;
  dedupeKey: string;
  symbol: string;
  thesisVersionId: string;
  conditionId: string;
  conditionVersion: string;
  fromStatus?: ConditionStatus;
  toStatus: ConditionStatus;
  severity: ConditionSeverity;
  title: string;
  explanation: string;
  asOf?: string;
  createdAt: string;
  readAt?: string;
  snoozedUntil?: string;
  archivedAt?: string;
}

export interface ReviewConditionSnapshot {
  conditionId: string;
  conditionVersion: string;
  name: string;
  severity: ConditionSeverity;
  status: ConditionStatus;
}

export interface ThesisReview {
  id: string;
  thesisVersionId: string;
  symbol: string;
  decision: Exclude<ThesisDecisionStatus, "active">;
  note?: string;
  conditionSnapshot: ReviewConditionSnapshot[];
  createdAt: string;
}

export interface ConditionView {
  condition: ThesisCondition;
  evaluation?: ConditionEvaluation;
}

export interface ThesisSymbolHealth {
  symbol: string;
  thesisVersionId?: string;
  status: ThesisHealthStatus;
  breachedCount: number;
  expiringCount: number;
  unreadAlertCount: number;
}

export interface ThesisHealthSummary {
  items: ThesisSymbolHealth[];
  breachedCount: number;
  expiringCount: number;
  unreadAlertCount: number;
}

export interface MonitorRunResult {
  conditions: ConditionEvaluation[];
  alertsCreated: number;
  warnings: string[];
}
