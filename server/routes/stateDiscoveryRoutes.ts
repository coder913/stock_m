import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Kysely, Transaction } from "kysely";
import { z } from "zod";
import type { SavedScreenInput } from "../../shared/discoveryState";
import { ApiError } from "../core/errors";
import type { Database } from "../db/types";
import type { PostgresDiscoveryStateRepository } from "../discovery/discoveryStateRepository";
import type { IdempotencyStore, StoredHttpResponse } from "../platform/idempotencyRepository";
import type { OutboxRepository } from "../platform/outboxRepository";
import { withIdempotency } from "../platform/withIdempotency";
import type { PostgresWatchlistRepository } from "../watchlists/watchlistRepository";

export interface StateDiscoveryRouteDependencies {
  database: Kysely<Database>;
  idempotency: IdempotencyStore;
  outbox: Pick<OutboxRepository, "append">;
  discovery: PostgresDiscoveryStateRepository;
  watchlists: PostgresWatchlistRepository;
}

const idSchema = z.object({ id: z.string().min(1) });
const symbolParamsSchema = z.object({ symbol: z.string().regex(/^[A-Za-z0-9.-]+$/) });
const groupSymbolParamsSchema = z.object({ id: z.string().min(1), symbol: z.string().regex(/^[A-Za-z0-9.-]+$/) });
const nameSchema = z.object({ name: z.string().trim().min(1).max(100) });
const renameSchema = nameSchema.extend({ version: z.number().int().positive() });
const versionSchema = z.object({ version: z.number().int().positive() });
const universeChangeSchema = z.object({ action: z.enum(["add", "remove", "restore"]), version: z.number().int().nonnegative() });
const moveSchema = z.object({ targetIndex: z.number().int().nonnegative() });
const addSymbolSchema = z.object({ symbol: z.string().regex(/^[A-Za-z0-9.-]+$/) });
const conditionSchema = z.object({
  id: z.string().min(1),
  metric: z.enum(["price", "dailyChangePercent", "revenueGrowthYoY", "epsGrowthYoY", "grossMarginVsIndustryMedian", "freeCashFlow", "forwardPE", "forwardPEToIndustryMedian", "peg", "freeCashFlowYield", "netDebtToEbitda", "earningsSurprise", "nextFyEpsRevision30d", "grossMarginYoYChange", "priceVs20DayHigh", "relativeVolume", "averageDollarVolume20d", "marketCap", "operatingMargin", "return3Months", "beta"]),
  operator: z.enum([">", ">=", "<", "<=", "=", "between"]),
  value: z.union([z.number().finite(), z.tuple([z.number().finite(), z.number().finite()])]),
  period: z.enum(["CURRENT", "MRQ", "TTM", "FY1"]),
});
const screenSchema = z.object({
  name: z.string().trim().min(1).max(100),
  conditions: z.array(conditionSchema).max(100),
  sort: z.object({ metric: conditionSchema.shape.metric, direction: z.enum(["asc", "desc"]) }),
});

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ApiError("INVALID_REQUEST", parsed.error.issues[0]?.message ?? "请求参数无效", 400, false);
  return parsed.data;
}

async function mutation<T>(
  dependencies: StateDiscoveryRouteDependencies,
  request: FastifyRequest,
  reply: FastifyReply,
  options: { route: string; body: unknown; statusCode?: number; topic: string },
  command: (transaction: Transaction<Database>) => Promise<{ aggregateId: string; value: T }>,
): Promise<FastifyReply> {
  const key = request.headers["idempotency-key"] as string;
  const response = await withIdempotency({ database: dependencies.database, store: dependencies.idempotency }, {
    key, route: options.route, body: options.body,
  }, async (transaction): Promise<StoredHttpResponse> => {
    const result = await command(transaction);
    await dependencies.outbox.append(transaction, {
      id: randomUUID(), topic: options.topic, aggregateId: result.aggregateId,
      payloadJson: result.value ?? { ok: true }, occurredAt: new Date(),
    });
    return { statusCode: options.statusCode ?? 200, body: result.value ?? { ok: true } };
  });
  return reply.status(response.statusCode).send(response.body);
}

export function registerStateDiscoveryRoutes(app: FastifyInstance, dependencies: StateDiscoveryRouteDependencies): void {
  app.get("/api/v1/watchlists", async (request) => {
    const query = request.query as { deleted?: string };
    return query.deleted === "true" ? dependencies.watchlists.listDeleted() : dependencies.watchlists.list();
  });
  app.post("/api/v1/watchlists", async (request, reply) => {
    const body = parse(nameSchema, request.body);
    return mutation(dependencies, request, reply, { route: "POST /api/v1/watchlists", body, statusCode: 201, topic: "watchlist.changed" },
      async (transaction) => { const value = await dependencies.watchlists.createGroup(body.name, transaction); return { aggregateId: value.id, value }; });
  });
  app.patch("/api/v1/watchlists/:id", async (request, reply) => {
    const { id } = parse(idSchema, request.params); const body = parse(renameSchema, request.body);
    return mutation(dependencies, request, reply, { route: "PATCH /api/v1/watchlists/:id", body: { id, ...body }, topic: "watchlist.changed" },
      async (transaction) => { const value = await dependencies.watchlists.renameGroup(id, body.name, body.version, transaction); return { aggregateId: id, value }; });
  });
  app.post("/api/v1/watchlists/:id/symbols", async (request, reply) => {
    const { id } = parse(idSchema, request.params); const body = parse(addSymbolSchema, request.body);
    return mutation(dependencies, request, reply, { route: "POST /api/v1/watchlists/:id/symbols", body: { id, ...body }, topic: "watchlist.changed" },
      async (transaction) => { const value = await dependencies.watchlists.addSymbol(id, body.symbol, transaction); return { aggregateId: id, value }; });
  });
  app.delete("/api/v1/watchlists/:id/symbols/:symbol", async (request, reply) => {
    const { id, symbol } = parse(groupSymbolParamsSchema, request.params);
    return mutation(dependencies, request, reply, { route: "DELETE /api/v1/watchlists/:id/symbols/:symbol", body: { id, symbol }, topic: "watchlist.changed" },
      async (transaction) => { const value = await dependencies.watchlists.removeSymbol(id, symbol, transaction); return { aggregateId: id, value }; });
  });
  app.delete("/api/v1/watchlists/:id", async (request, reply) => {
    const { id } = parse(idSchema, request.params);
    return mutation(dependencies, request, reply, { route: "DELETE /api/v1/watchlists/:id", body: { id }, topic: "watchlist.changed" },
      async (transaction) => { const value = await dependencies.watchlists.removeGroup(id, transaction); return { aggregateId: id, value }; });
  });
  app.post("/api/v1/watchlists/:id/restore", async (request, reply) => {
    const { id } = parse(idSchema, request.params);
    return mutation(dependencies, request, reply, { route: "POST /api/v1/watchlists/:id/restore", body: { id }, topic: "watchlist.changed" },
      async (transaction) => { const value = await dependencies.watchlists.restoreGroup(id, transaction); return { aggregateId: id, value }; });
  });
  app.post("/api/v1/watchlists/:id/move", async (request, reply) => {
    const { id } = parse(idSchema, request.params); const body = parse(moveSchema, request.body);
    return mutation(dependencies, request, reply, { route: "POST /api/v1/watchlists/:id/move", body: { id, ...body }, topic: "watchlist.changed" },
      async (transaction) => { await dependencies.watchlists.moveGroup(id, body.targetIndex, transaction); return { aggregateId: id, value: { ok: true } }; });
  });

  app.get("/api/v1/discovery/universe", () => dependencies.discovery.getUniverseState());
  app.put("/api/v1/discovery/universe/:symbol", async (request, reply) => {
    const { symbol } = parse(symbolParamsSchema, request.params); const body = parse(universeChangeSchema, request.body);
    return mutation(dependencies, request, reply, { route: "PUT /api/v1/discovery/universe/:symbol", body: { symbol, ...body }, topic: "discovery.universe.changed" }, async (transaction) => {
      const value = body.action === "add" ? await dependencies.discovery.addUniverseSymbol(symbol, body.version, transaction)
        : body.action === "remove" ? await dependencies.discovery.removeUniverseSymbol(symbol, body.version, transaction)
          : await dependencies.discovery.restoreUniverseSymbol(symbol, body.version, transaction);
      return { aggregateId: "local-single-user", value };
    });
  });
  app.get("/api/v1/discovery/screens", () => dependencies.discovery.listScreens());
  app.post("/api/v1/discovery/screens", async (request, reply) => {
    const body = parse(screenSchema, request.body) as SavedScreenInput;
    return mutation(dependencies, request, reply, { route: "POST /api/v1/discovery/screens", body, statusCode: 201, topic: "discovery.screen.changed" },
      async (transaction) => { const value = await dependencies.discovery.createScreen(body, transaction); return { aggregateId: value.id, value }; });
  });
  app.patch("/api/v1/discovery/screens/:id", async (request, reply) => {
    const { id } = parse(idSchema, request.params); const body = parse(renameSchema, request.body);
    return mutation(dependencies, request, reply, { route: "PATCH /api/v1/discovery/screens/:id", body: { id, ...body }, topic: "discovery.screen.changed" },
      async (transaction) => { const value = await dependencies.discovery.renameScreen(id, body.name, body.version, transaction); return { aggregateId: id, value }; });
  });
  app.post("/api/v1/discovery/screens/:id/duplicate", async (request, reply) => {
    const { id } = parse(idSchema, request.params);
    return mutation(dependencies, request, reply, { route: "POST /api/v1/discovery/screens/:id/duplicate", body: { id }, statusCode: 201, topic: "discovery.screen.changed" },
      async (transaction) => { const value = await dependencies.discovery.duplicateScreen(id, transaction); return { aggregateId: value.id, value }; });
  });
  app.delete("/api/v1/discovery/screens/:id", async (request, reply) => {
    const { id } = parse(idSchema, request.params); const body = parse(versionSchema, request.body);
    return mutation(dependencies, request, reply, { route: "DELETE /api/v1/discovery/screens/:id", body: { id, ...body }, topic: "discovery.screen.changed" },
      async (transaction) => { await dependencies.discovery.removeScreen(id, body.version, transaction); return { aggregateId: id, value: { ok: true } }; });
  });
}
