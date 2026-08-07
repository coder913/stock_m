import { ApiError } from "./errors";

export type RefreshHandler = (payload: Record<string, unknown>) => Promise<unknown>;

export class RefreshRegistry {
  private readonly handlers = new Map<string, RefreshHandler>();
  register(resource: string, handler: RefreshHandler): void { this.handlers.set(resource, handler); }
  async refresh(payload: Record<string, unknown>): Promise<unknown> {
    const resource = payload.resource;
    const handler = typeof resource === "string" ? this.handlers.get(resource) : undefined;
    if (!handler) throw new ApiError("REFRESH_RESOURCE_UNAVAILABLE", "该数据暂不支持手动刷新", 400, false);
    return handler(payload);
  }
}
