import type { ColumnType } from "kysely";

type Timestamp = ColumnType<Date, Date | string, never>;
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

export interface Database {
  "platform.schema_migration": SchemaMigrationTable;
  "platform.idempotency_record": IdempotencyRecordTable;
  "platform.outbox_event": OutboxEventTable;
  "platform.inbox_event": InboxEventTable;
  "platform.dead_letter": DeadLetterTable;
  "platform.installation": InstallationTable;
}
