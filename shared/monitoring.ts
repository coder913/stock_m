export type DataSource = "alpaca" | "sec" | "finnhub" | "fred" | "composite";
export type MonitorMetric = "price" | "dailyChangePercent" | "revenueGrowthYoY" | "operatingMargin" | "freeCashFlow" | "freeCashFlowYield" | "netDebtToEbitda" | "earningsSurprise" | "grossMarginYoYChange" | "priceVs20DayHigh" | "relativeVolume" | "averageDollarVolume20d";
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
export type MonitorEventType = "earnings" | "dividend" | "split" | "corporate-action" | "macro";

export interface BaseCondition { id: string; symbol: string; thesisVersionId: string; name: string; direction: ConditionDirection; severity: ConditionSeverity; deadline?: string; note?: string; createdAt: string; updatedAt: string; deletedAt?: string; conditionVersion?: string; }
export interface MetricCondition extends BaseCondition { kind: "metric"; metric: MonitorMetric; operator: MetricOperator; target: number | readonly [number, number]; period: MetricPeriod; }
export interface EventCondition extends BaseCondition { kind: "event"; eventType: MonitorEventType; occurrence: EventOccurrence; from?: string; to: string; }
export type ThesisCondition = MetricCondition | EventCondition;
export type MetricConditionDraft = Omit<MetricCondition, "symbol" | "thesisVersionId" | "createdAt" | "updatedAt" | "deletedAt" | "conditionVersion">;
export type EventConditionDraft = Omit<EventCondition, "symbol" | "thesisVersionId" | "createdAt" | "updatedAt" | "deletedAt" | "conditionVersion">;
export type ConditionDraft = MetricConditionDraft | EventConditionDraft;
export interface MetricValue { value?: number; source?: DataSource; asOf?: string; dataState: EvaluationDataState; notices: string[]; }
export interface MonitorEvent { id: string; type: MonitorEventType; symbol?: string; title: string; scheduledAt: string; timing: "before-market" | "during-market" | "after-market" | "all-day" | "unknown"; source: Exclude<DataSource, "composite">; sourceUrl?: string; split?: { oldRate: number; newRate: number; quantityMultiplier: number; effectiveDate: string }; }
export interface MonitorSnapshot { symbol: string; metrics: Partial<Record<MonitorMetric, MetricValue>>; events: MonitorEvent[]; eventsState: EvaluationDataState; eventsAsOf?: string; generatedAt: string; }
export interface ConditionEvaluation { id: string; conditionId: string; conditionVersion: string; status: ConditionStatus; dataState: EvaluationDataState; actualValue?: number | string; targetValue?: number | readonly [number, number] | string; source?: DataSource; asOf?: string; explanation: string; evaluatedAt: string; changed: boolean; previousStatus?: ConditionStatus; }
export interface MonitorAlert { id: string; dedupeKey: string; symbol: string; thesisVersionId: string; conditionId: string; conditionVersion: string; fromStatus?: ConditionStatus; toStatus: ConditionStatus; severity: ConditionSeverity; title: string; explanation: string; asOf?: string; createdAt: string; readAt?: string; snoozedUntil?: string; archivedAt?: string; }
export type MonitorAlertAction = { id: string; alertId: string; type: "read" | "snooze" | "archive" | "restore"; until?: string; createdAt: string };
export type AlertActionInput = { type: "read" | "archive" | "restore" } | { type: "snooze"; until: string };
export interface ReviewConditionSnapshot { conditionId: string; conditionVersion: string; name: string; severity: ConditionSeverity; status: ConditionStatus; }
export interface ThesisReview { id: string; thesisVersionId: string; symbol: string; decision: Exclude<ThesisDecisionStatus, "active">; note?: string; conditionSnapshot: ReviewConditionSnapshot[]; createdAt: string; }
export type ReviewInput = Omit<ThesisReview, "id" | "createdAt"> & { id?: string; createdAt?: string };
export interface ConditionView { condition: ThesisCondition; evaluation?: ConditionEvaluation; }
export interface ThesisSymbolHealth { symbol: string; thesisVersionId?: string; status: ThesisHealthStatus; breachedCount: number; expiringCount: number; unreadAlertCount: number; }
export interface ThesisHealthSummary { items: ThesisSymbolHealth[]; breachedCount: number; expiringCount: number; unreadAlertCount: number; }
export interface MonitorRunResult { conditions: ConditionEvaluation[]; alertsCreated: number; warnings: string[]; }
export interface AlertListQuery { view: "pending" | "snoozed" | "archived"; now: string; symbol?: string; severity?: ConditionSeverity; toStatus?: ConditionStatus; from?: string; to?: string; }
