export type LedgerEventType = "buy" | "sell" | "dividend" | "fee";

export interface LedgerEvent {
  id: string;
  type: LedgerEventType;
  symbol?: string;
  occurredAt: string;
  quantity?: number;
  price?: number;
  amount?: number;
  thesisVersionId?: string;
  reason?: string;
}

export type LedgerEventInput = Omit<LedgerEvent, "id">;
export interface MigrationResult { migrated: number; skipped: boolean; }
