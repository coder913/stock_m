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
}
