import { createHash } from "node:crypto";
import type { Kysely, Transaction } from "kysely";
import type { Database } from "../db/types";
import type { IdempotencyRetention, IdempotencyStore, StoredHttpResponse } from "./idempotencyRepository";

type CanonicalValue = null | boolean | number | string | CanonicalValue[] | { [key: string]: CanonicalValue };

function canonicalize(value: unknown): CanonicalValue {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Idempotency input must contain finite numbers");
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)]));
  }
  throw new TypeError(`Unsupported idempotency input: ${typeof value}`);
}

export function canonicalJson(value: unknown): string { return JSON.stringify(canonicalize(value)); }

export function requestFingerprint(input: { route: string; body: unknown }): string {
  return createHash("sha256").update(canonicalJson(input)).digest("hex");
}

export async function withIdempotency(
  dependencies: { database: Kysely<Database>; store: IdempotencyStore },
  input: { key: string; route: string; body: unknown; retention?: IdempotencyRetention },
  command: (transaction: Transaction<Database>) => Promise<StoredHttpResponse>,
): Promise<StoredHttpResponse> {
  const fingerprint = requestFingerprint({ route: input.route, body: input.body });
  return dependencies.database.transaction().execute((transaction) => dependencies.store.execute(
    transaction, input.key, fingerprint, () => command(transaction), input.retention,
  ));
}
