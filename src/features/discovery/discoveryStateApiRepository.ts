import type { AsyncDiscoveryStateRepository, SavedScreen, SavedScreenInput, UserUniverseState } from "../../../shared/discoveryState";
import { ApiClient } from "../../app/apiClient";

const key = (provided?: string) => provided ?? globalThis.crypto.randomUUID();
const symbolPath = (symbol: string) => encodeURIComponent(symbol.trim().toUpperCase());

export class DiscoveryStateApiRepository implements AsyncDiscoveryStateRepository {
  constructor(private readonly client = new ApiClient("/api/v1")) {}

  getUniverseState(): Promise<UserUniverseState> { return this.client.requestJson({ path: "/discovery/universe" }); }
  addUniverseSymbol(symbol: string, version: number, idempotencyKey?: string): Promise<UserUniverseState> {
    return this.changeUniverse(symbol, "add", version, idempotencyKey);
  }
  removeUniverseSymbol(symbol: string, version: number, idempotencyKey?: string): Promise<UserUniverseState> {
    return this.changeUniverse(symbol, "remove", version, idempotencyKey);
  }
  restoreUniverseSymbol(symbol: string, version: number, idempotencyKey?: string): Promise<UserUniverseState> {
    return this.changeUniverse(symbol, "restore", version, idempotencyKey);
  }
  listScreens(): Promise<SavedScreen[]> { return this.client.requestJson({ path: "/discovery/screens" }); }
  createScreen(input: SavedScreenInput, idempotencyKey?: string): Promise<SavedScreen> {
    return this.client.requestJson({ method: "POST", path: "/discovery/screens", body: input, idempotencyKey: key(idempotencyKey) });
  }
  renameScreen(id: string, name: string, version: number, idempotencyKey?: string): Promise<SavedScreen> {
    return this.client.requestJson({ method: "PATCH", path: `/discovery/screens/${encodeURIComponent(id)}`, body: { name, version }, idempotencyKey: key(idempotencyKey) });
  }
  duplicateScreen(id: string, idempotencyKey?: string): Promise<SavedScreen> {
    return this.client.requestJson({ method: "POST", path: `/discovery/screens/${encodeURIComponent(id)}/duplicate`, idempotencyKey: key(idempotencyKey) });
  }
  async removeScreen(id: string, version: number, idempotencyKey?: string): Promise<void> {
    await this.client.requestJson({ method: "DELETE", path: `/discovery/screens/${encodeURIComponent(id)}`, body: { version }, idempotencyKey: key(idempotencyKey) });
  }

  private changeUniverse(symbol: string, action: "add" | "remove" | "restore", version: number, idempotencyKey?: string): Promise<UserUniverseState> {
    return this.client.requestJson({ method: "PUT", path: `/discovery/universe/${symbolPath(symbol)}`, body: { action, version }, idempotencyKey: key(idempotencyKey) });
  }
}
