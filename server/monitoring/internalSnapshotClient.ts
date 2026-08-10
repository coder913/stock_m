import type { MonitorSnapshot, MonitorSnapshotProvenance, MonitorSnapshotRequest, MonitorSnapshotResponse } from "../../shared/monitoring";

export class InternalSnapshotError extends Error {
  constructor(public readonly code: string, message: string, public readonly retryable: boolean, public readonly statusCode: number) { super(message); }
}

export interface LoadedMonitorSnapshots {
  snapshots: Map<string, MonitorSnapshot>;
  provenance: MonitorSnapshotProvenance;
}

export class InternalSnapshotClient {
  constructor(private readonly baseUrl: string, private readonly token: string, private readonly fetcher: typeof fetch = globalThis.fetch) {}

  async load(input: MonitorSnapshotRequest): Promise<LoadedMonitorSnapshots> {
    const response = await this.fetcher(`${this.baseUrl.replace(/\/$/, "")}/internal/v1/monitor-snapshots`, {
      method: "POST",
      headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    const body = await response.json() as MonitorSnapshotResponse | { code?: string; message?: string; retryable?: boolean };
    if (!response.ok) {
      const error = body as { code?: string; message?: string; retryable?: boolean };
      throw new InternalSnapshotError(error.code ?? "SNAPSHOT_REQUEST_FAILED", error.message ?? "Monitor snapshot request failed", Boolean(error.retryable), response.status);
    }
    const result = body as MonitorSnapshotResponse;
    return { snapshots: new Map(Object.entries(result.snapshots).map(([symbol, snapshot]) => [symbol.toUpperCase(), snapshot])), provenance: result.provenance };
  }
}
