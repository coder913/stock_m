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
}
