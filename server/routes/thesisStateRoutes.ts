import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Kysely, Transaction } from "kysely";
import { z } from "zod";
import type { ConditionDraft } from "../../shared/monitoring";
import type { ThesisDraft } from "../../shared/thesis";
import { ApiError } from "../core/errors";
import type { Database } from "../db/types";
import type { IdempotencyStore, StoredHttpResponse } from "../platform/idempotencyRepository";
import type { OutboxRepository } from "../platform/outboxRepository";
import { withIdempotency } from "../platform/withIdempotency";
import type { PostgresThesisRepository } from "../thesis/thesisRepository";

export interface ThesisStateRouteDependencies { database: Kysely<Database>; idempotency: IdempotencyStore; outbox: Pick<OutboxRepository, "append">; repository: PostgresThesisRepository; }
const idSchema = z.object({ id: z.string().min(1) });
const conditionIdSchema = z.object({ conditionId: z.string().min(1) });
const symbolSchema = z.object({ symbol: z.string().regex(/^[A-Za-z0-9.-]+$/) });
const thesisSchema = z.object({ symbol: z.string().regex(/^[A-Za-z0-9.-]+$/), coreJudgment: z.string().trim().min(1), evidence: z.array(z.string().trim().min(1)).min(1), risks: z.array(z.string().trim().min(1)).min(1), validationConditions: z.array(z.string().trim().min(1)).min(1) });
const conditionSchema = z.object({ id: z.string().min(1), kind: z.enum(["metric", "event"]), name: z.string().trim().min(1), direction: z.enum(["support", "risk"]), severity: z.enum(["low", "medium", "high"]), deadline: z.string().optional(), note: z.string().optional() }).passthrough();
const createConditionsSchema = z.object({ symbol: z.string().regex(/^[A-Za-z0-9.-]+$/), conditions: z.array(conditionSchema) });
const copySchema = z.object({ sourceThesisVersionId: z.string().min(1) });
function parse<T>(schema: z.ZodType<T>, value: unknown): T { const parsed = schema.safeParse(value); if (!parsed.success) throw new ApiError("INVALID_REQUEST", parsed.error.issues[0]?.message ?? "请求参数无效", 400, false); return parsed.data; }
async function mutation<T>(dependencies: ThesisStateRouteDependencies, request: FastifyRequest, reply: FastifyReply, options: { route: string; body: unknown; topic: string; statusCode?: number }, command: (transaction: Transaction<Database>) => Promise<{ aggregateId: string; value: T }>): Promise<FastifyReply> {
  const response = await withIdempotency({ database: dependencies.database, store: dependencies.idempotency }, { key: request.headers["idempotency-key"] as string, route: options.route, body: options.body }, async (transaction): Promise<StoredHttpResponse> => {
    const result = await command(transaction); await dependencies.outbox.append(transaction, { id: randomUUID(), topic: options.topic, aggregateId: result.aggregateId, payloadJson: result.value ?? { ok: true }, occurredAt: new Date() });
    return { statusCode: options.statusCode ?? 200, body: result.value ?? { ok: true } };
  });
  return reply.status(response.statusCode).send(response.body);
}

export function registerThesisStateRoutes(app: FastifyInstance, dependencies: ThesisStateRouteDependencies): void {
  app.get("/api/v1/theses", () => dependencies.repository.listLatest());
  app.get("/api/v1/theses/:symbol/latest", async (request) => (await dependencies.repository.getLatest(parse(symbolSchema, request.params).symbol)) ?? null);
  app.get("/api/v1/theses/:symbol/history", (request) => dependencies.repository.getHistory(parse(symbolSchema, request.params).symbol));
  app.post("/api/v1/theses", async (request, reply) => { const body = parse(thesisSchema, request.body) as ThesisDraft; return mutation(dependencies, request, reply, { route: "POST /api/v1/theses", body, topic: "thesis.version.created", statusCode: 201 }, async (transaction) => { const value = await dependencies.repository.create(body, transaction); return { aggregateId: value.id, value }; }); });
  app.get("/api/v1/theses/:id/conditions", (request) => dependencies.repository.listConditions(parse(idSchema, request.params).id));
  app.post("/api/v1/theses/:id/conditions", async (request, reply) => { const { id } = parse(idSchema, request.params); const body = parse(createConditionsSchema, request.body); return mutation(dependencies, request, reply, { route: "POST /api/v1/theses/:id/conditions", body: { id, ...body }, topic: "thesis.conditions.created", statusCode: 201 }, async (transaction) => ({ aggregateId: id, value: await dependencies.repository.createConditions({ symbol: body.symbol, thesisVersionId: id, conditions: body.conditions as ConditionDraft[] }, transaction) })); });
  app.post("/api/v1/theses/:id/conditions/copy", async (request, reply) => { const { id } = parse(idSchema, request.params); const body = parse(copySchema, request.body); return mutation(dependencies, request, reply, { route: "POST /api/v1/theses/:id/conditions/copy", body: { id, ...body }, topic: "thesis.conditions.copied", statusCode: 201 }, async (transaction) => ({ aggregateId: id, value: await dependencies.repository.copyConditions(body.sourceThesisVersionId, id, transaction) })); });
  app.delete("/api/v1/thesis-conditions/:conditionId", async (request, reply) => { const { conditionId } = parse(conditionIdSchema, request.params); return mutation(dependencies, request, reply, { route: "DELETE /api/v1/thesis-conditions/:conditionId", body: { conditionId }, topic: "thesis.condition.deleted" }, async (transaction) => ({ aggregateId: conditionId, value: await dependencies.repository.softDeleteCondition(conditionId, transaction) })); });
}
