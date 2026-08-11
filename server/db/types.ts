import type { ColumnType, Generated } from "kysely";

type Timestamp = ColumnType<Date, Date | string, Date | string>;
type NullableTimestamp = ColumnType<Date | null, Date | string | null, Date | string | null>;

export interface SchemaMigrationTable {
  name: string;
  appliedAt: Timestamp;
}

export interface IdempotencyRecordTable {
  key: string;
  fingerprint: string;
  statusCode: number;
  responseJson: unknown;
  createdAt: Timestamp;
  expiresAt: Timestamp;
}

export interface OutboxEventTable {
  id: string;
  topic: string;
  aggregateId: string;
  payloadJson: unknown;
  occurredAt: Timestamp;
  publishedAt: NullableTimestamp;
  attempts: number;
}

export interface InboxEventTable {
  consumer: string;
  eventId: string;
  consumedAt: Timestamp;
}

export interface DeadLetterTable {
  id: string;
  consumer: string;
  eventId: string;
  reason: string;
  payloadJson: unknown;
  createdAt: Timestamp;
}

export interface InstallationTable {
  id: string;
  createdAt: Timestamp;
}

export interface UserUniverseSymbolTable {
  symbol: string;
  kind: "added" | "removed_default";
  createdAt: Timestamp;
}

export interface UserUniverseRevisionTable { id: string; version: number; }

export interface SavedScreenTable {
  id: string;
  ordinal: Generated<number>;
  name: string;
  conditionsJson: unknown;
  sortMetric: string;
  sortDirection: "asc" | "desc";
  version: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  deletedAt: NullableTimestamp;
}

export interface WatchlistGroupTable {
  id: string;
  name: string;
  orderIndex: ColumnType<number, number, number>;
  version: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  deletedAt: NullableTimestamp;
}

export interface WatchlistSymbolTable {
  groupId: string;
  symbol: string;
  orderIndex: ColumnType<number, number, number>;
  createdAt: Timestamp;
}

export interface ThesisVersionTable { id: string; symbol: string; version: number; coreJudgment: string; evidenceJson: unknown; risksJson: unknown; validationConditionsJson: unknown; createdAt: Timestamp; }
export interface ThesisConditionTable { id: string; thesisVersionId: string; symbol: string; kind: "metric" | "event"; name: string; direction: "support" | "risk"; severity: "low" | "medium" | "high"; deadline: ColumnType<string | null, string | null, string | null>; note: string | null; specJson: unknown; conditionVersion: string; createdAt: Timestamp; updatedAt: Timestamp; deletedAt: NullableTimestamp; }
export interface ConditionEvaluationTable { id: string; conditionId: string; conditionVersion: string; dedupeKey: string; status: "pending" | "confirmed" | "breached" | "expired"; dataState: "fresh" | "missing" | "stale" | "unavailable"; actualValueJson: unknown | null; targetValueJson: unknown | null; source: string | null; asOf: NullableTimestamp; explanation: string; evaluatedAt: Timestamp; changed: boolean; previousStatus: string | null; }
export interface MonitorAlertTable { id: string; dedupeKey: string; symbol: string; thesisVersionId: string; conditionId: string; conditionVersion: string; fromStatus: string | null; toStatus: "pending" | "confirmed" | "breached" | "expired"; severity: "low" | "medium" | "high"; title: string; explanation: string; asOf: NullableTimestamp; createdAt: Timestamp; }
export interface MonitorAlertActionTable { id: string; ordinal: Generated<number>; alertId: string; type: "read" | "snooze" | "archive" | "restore"; untilAt: NullableTimestamp; createdAt: Timestamp; }
export interface ThesisReviewTable { id: string; thesisVersionId: string; symbol: string; decision: "reaffirmed" | "invalidated" | "archived"; note: string | null; conditionSnapshotJson: unknown; createdAt: Timestamp; }
export interface ManualPortfolioTable { id: string; revision: number; }
export interface ManualPortfolioSettingsTable { portfolioId: string; initialCash: ColumnType<string, string | number, string | number>; inceptionDate: ColumnType<string, string, string>; benchmarkSymbol: string; baseCurrency: "USD"; version: number; updatedAt: Timestamp; }
export interface ManualPortfolioLedgerEventTable { id: string; ordinal: Generated<number>; portfolioId: string; type: "buy"|"sell"|"dividend"|"fee"|"deposit"|"withdrawal"|"split"; symbol: string|null; occurredAt: Timestamp; quantity: ColumnType<string|null, string|number|null, never>; price: ColumnType<string|null, string|number|null, never>; amount: ColumnType<string|null, string|number|null, never>; thesisVersionId: string|null; reason: string|null; oldRate: ColumnType<string|null, string|number|null, never>; newRate: ColumnType<string|null, string|number|null, never>; quantityMultiplier: ColumnType<string|null, string|number|null, never>; source: "alpaca"|"manual"|null; sourceEventId: string|null; confirmedAt: NullableTimestamp; }
export interface IgnoredSplitTable { sourceEventId: string; portfolioId: string; symbol: string; note: string; ignoredAt: Timestamp; }
export interface PortfolioAlertTable { id:string; portfolioId:string; dedupeKey:string; rule:string; severity:"info"|"warning"|"critical"; symbol:string|null; message:string; currentValueJson:unknown; thresholdJson:unknown; createdAt:Timestamp; }
export interface PortfolioAlertActionTable { id:string; ordinal:Generated<number>; alertId:string; type:string; untilAt:NullableTimestamp; createdAt:Timestamp; }
export interface PortfolioSnapshotTable { id:string; portfolioId:string; asOf:Timestamp; snapshotJson:unknown; createdAt:Timestamp; }
export interface PortfolioWeeklyReviewTable { id:string; portfolioId:string; week:string; version:number; snapshotId:string; judgment:string; action:string; result:string; nextObservationsJson:unknown; tradeCount:number; openAlertCount:number; createdAt:Timestamp; }
export interface BrowserMigrationReceiptTable{id:string;documentHash:string;browserId:string;categoryCountsJson:unknown;categoryHashesJson:unknown;completedAt:Timestamp;}
export interface BrowserMigrationRecordTable{category:string;ordinal:number;payloadJson:unknown;}
export interface MarketCacheEntryTable { cacheKey:string; source:string; payloadJson:unknown; asOf:Timestamp; fetchedAt:Timestamp; expiresAt:Timestamp; delayMinutes:number|null; noticesJson:unknown; }
export interface MarketProviderStateTable { source:string; cooldownUntil:NullableTimestamp; lastSuccessAt:NullableTimestamp; lastErrorCode:string|null; }
export interface MarketRefreshAttemptTable { id:Generated<number>; cacheKey:string; source:string; status:"success"|"error"; errorCode:string|null; attemptedAt:Timestamp; }
export interface WorkerHeartbeatTable { worker:"monitor"|"notifications"|"trading"; state:"starting"|"ready"|"degraded"|"stopping"; queueLag:number; heartbeatAt:Timestamp; }
export interface MonitorScheduleStateTable { runType:"price"|"financial"|"event"; lastSuccessNaturalPeriod:string; lastSuccessAt:Timestamp; updatedAt:Timestamp; }
export interface MonitorRunTable { id:string; runType:"price"|"financial"|"event"; naturalPeriod:string; scheduledFor:Timestamp; catchUp:boolean; status:"claimed"|"running"|"succeeded"|"failed"; dataState:"fresh"|"stale"|"unavailable"|null; diagnosticsJson:unknown; createdAt:Timestamp; startedAt:NullableTimestamp; finishedAt:NullableTimestamp; }
export interface PushSubscriptionTable { id:string; endpointHash:string; ciphertext:string; iv:string; authTag:string; userAgent:string; createdAt:Timestamp; lastSeenAt:Timestamp; revokedAt:NullableTimestamp; invalidAt:NullableTimestamp; }
export interface NotificationDeliveryTable { id:string; eventId:string; alertId:string; subscriptionId:string; payloadJson:unknown; status:"pending"|"succeeded"|"invalid"|"dead_letter"; attemptCount:number; nextAttemptAt:NullableTimestamp; lastError:string|null; createdAt:Timestamp; completedAt:NullableTimestamp; }
export interface NotificationDeliveryAttemptTable { id:string; deliveryId:string; attemptNumber:number; outcome:"succeeded"|"retry"|"invalid"|"failed"; statusCode:number|null; error:string|null; attemptedAt:Timestamp; }
type Decimal = ColumnType<string, string | number, string | number>;
type NullableDecimal = ColumnType<string | null, string | number | null, string | number | null>;
export interface BrokerAccountTable { id:string; status:string; currency:string; createdAt:Timestamp; updatedAt:Timestamp; }
export interface BrokerAccountSnapshotTable { id:string; accountId:string; cash:Decimal; buyingPower:Decimal; equity:Decimal; portfolioValue:Decimal; tradingBlocked:boolean; accountBlocked:boolean; observedAt:Timestamp; }
export interface BrokerOrderPreviewAuditTable { id:string; inputHash:string; normalizedOrderJson:unknown; expiresAt:Timestamp; createdAt:Timestamp; }
export interface BrokerOrderIntentTable { id:string; previewId:string; clientOrderId:string; symbol:string; side:"buy"|"sell"; quantity:Decimal; orderType:"market"|"limit"; timeInForce:"day"|"gtc"; limitPrice:NullableDecimal; confirmedAt:Timestamp; }
export interface BrokerCancelIntentTable { id:string; orderIntentId:string; createdAt:Timestamp; }
export interface BrokerRemoteOrderTable { remoteOrderId:string; orderIntentId:string; rawJson:unknown; firstObservedAt:Timestamp; lastObservedAt:Timestamp; }
export interface BrokerOrderEventTable { id:string; orderIntentId:string; remoteEventId:string|null; event:string; payloadJson:unknown; occurredAt:Timestamp; createdAt:Timestamp; }
export interface BrokerOrderProjectionTable { orderIntentId:string; state:string; version:number; updatedAt:Timestamp; }
export interface BrokerFillTable { remoteFillId:string; remoteOrderId:string; symbol:string; side:"buy"|"sell"; quantity:Decimal; price:Decimal; occurredAt:Timestamp; rawJson:unknown; }
export interface BrokerActivityTable { remoteActivityId:string; activityType:string; symbol:string|null; amount:NullableDecimal; quantity:NullableDecimal; price:NullableDecimal; occurredAt:Timestamp; rawJson:unknown; }
export interface BrokerLedgerEventTable { id:string; remoteSourceId:string; eventType:string; symbol:string|null; quantity:NullableDecimal; price:NullableDecimal; amount:NullableDecimal; occurredAt:Timestamp; provenanceJson:unknown; }
export interface BrokerReconciliationRunTable { id:string; status:"running"|"succeeded"|"failed"; diagnosticsJson:unknown; startedAt:Timestamp; finishedAt:NullableTimestamp; }
export interface BrokerDriftTable { id:string; reconciliationRunId:string; cashDifference:NullableDecimal; symbolDifferencesJson:unknown; detectedAt:Timestamp; clearedAt:NullableTimestamp; }

export interface Database {
  "platform.schema_migration": SchemaMigrationTable;
  "platform.idempotency_record": IdempotencyRecordTable;
  "platform.outbox_event": OutboxEventTable;
  "platform.inbox_event": InboxEventTable;
  "platform.dead_letter": DeadLetterTable;
  "platform.installation": InstallationTable;
  "core.user_universe_symbol": UserUniverseSymbolTable;
  "core.user_universe_revision": UserUniverseRevisionTable;
  "core.saved_screen": SavedScreenTable;
  "core.watchlist_group": WatchlistGroupTable;
  "core.watchlist_symbol": WatchlistSymbolTable;
  "core.thesis_version": ThesisVersionTable;
  "core.thesis_condition": ThesisConditionTable;
  "monitor.condition_evaluation": ConditionEvaluationTable;
  "monitor.alert": MonitorAlertTable;
  "monitor.alert_action": MonitorAlertActionTable;
  "monitor.thesis_review": ThesisReviewTable;
  "core.manual_portfolio": ManualPortfolioTable;
  "core.manual_portfolio_settings": ManualPortfolioSettingsTable;
  "core.manual_portfolio_ledger_event": ManualPortfolioLedgerEventTable;
  "core.manual_portfolio_ignored_split": IgnoredSplitTable;
  "core.portfolio_alert": PortfolioAlertTable;
  "core.portfolio_alert_action": PortfolioAlertActionTable;
  "core.portfolio_snapshot": PortfolioSnapshotTable;
  "core.portfolio_weekly_review": PortfolioWeeklyReviewTable;
  "platform.browser_migration_receipt":BrowserMigrationReceiptTable;
  "platform.browser_migration_record":BrowserMigrationRecordTable;
  "market.cache_entry":MarketCacheEntryTable;
  "market.provider_state":MarketProviderStateTable;
  "market.refresh_attempt":MarketRefreshAttemptTable;
  "platform.worker_heartbeat":WorkerHeartbeatTable;
  "monitor.schedule_state":MonitorScheduleStateTable;
  "monitor.run":MonitorRunTable;
  "notification.push_subscription":PushSubscriptionTable;
  "notification.delivery":NotificationDeliveryTable;
  "notification.delivery_attempt":NotificationDeliveryAttemptTable;
  "broker.account":BrokerAccountTable;
  "broker.account_snapshot":BrokerAccountSnapshotTable;
  "broker.order_preview_audit":BrokerOrderPreviewAuditTable;
  "broker.order_intent":BrokerOrderIntentTable;
  "broker.cancel_intent":BrokerCancelIntentTable;
  "broker.remote_order":BrokerRemoteOrderTable;
  "broker.order_event":BrokerOrderEventTable;
  "broker.order_projection":BrokerOrderProjectionTable;
  "broker.fill":BrokerFillTable;
  "broker.activity":BrokerActivityTable;
  "broker.ledger_event":BrokerLedgerEventTable;
  "broker.reconciliation_run":BrokerReconciliationRunTable;
  "broker.drift":BrokerDriftTable;
}
