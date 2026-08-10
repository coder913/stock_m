import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Kysely, Transaction } from "kysely";
import { z } from "zod";
import type { AlertListQuery, ConditionEvaluation, MonitorAlert } from "../../shared/monitoring";
import { ApiError } from "../core/errors";
import type { Database } from "../db/types";
import type { PostgresMonitorStateRepository } from "../monitoring/monitorStateRepository";
import type { IdempotencyStore, StoredHttpResponse } from "../platform/idempotencyRepository";
import type { OutboxRepository } from "../platform/outboxRepository";
import { withIdempotency } from "../platform/withIdempotency";

export interface MonitorStateRouteDependencies { database: Kysely<Database>; idempotency: IdempotencyStore; outbox: Pick<OutboxRepository, "append">; repository: PostgresMonitorStateRepository; }
const idSchema = z.object({ id: z.string().min(1) });
const alertQuerySchema = z.object({ view: z.enum(["pending", "snoozed", "archived"]).default("pending"), now: z.string().datetime(), symbol: z.string().optional(), severity: z.enum(["low", "medium", "high"]).optional(), toStatus: z.enum(["pending", "confirmed", "breached", "expired"]).optional(), from: z.string().optional(), to: z.string().optional() });
const conditionQuerySchema = z.object({ conditionId: z.string().min(1) });
const reviewQuerySchema = z.object({ thesisVersionId: z.string().min(1) });
const actionSchema = z.discriminatedUnion("type", [z.object({ type: z.literal("read") }), z.object({ type: z.literal("archive") }), z.object({ type: z.literal("restore") }), z.object({ type: z.literal("snooze"), until: z.string().datetime() })]);
const evaluationSchema = z.object({ id: z.string().min(1), conditionId: z.string().min(1), conditionVersion: z.string().min(1), status: z.enum(["pending", "confirmed", "breached", "expired"]), dataState: z.enum(["fresh", "missing", "stale", "unavailable"]), explanation: z.string(), evaluatedAt: z.string().datetime(), changed: z.boolean() }).passthrough();
const alertSchema = z.object({ id: z.string().min(1), dedupeKey: z.string().min(1), symbol: z.string().min(1), thesisVersionId: z.string().min(1), conditionId: z.string().min(1), conditionVersion: z.string().min(1), toStatus: z.enum(["pending", "confirmed", "breached", "expired"]), severity: z.enum(["low", "medium", "high"]), title: z.string().min(1), explanation: z.string(), createdAt: z.string().datetime() }).passthrough();
const reviewSchema = z.object({ thesisVersionId: z.string().min(1), symbol: z.string().min(1), decision: z.enum(["reaffirmed", "invalidated", "archived"]), note: z.string().optional(), conditionSnapshot: z.array(z.unknown()), createdAt: z.string().datetime().optional() });
function parse<T>(schema: z.ZodType<T>, value: unknown): T { const parsed = schema.safeParse(value); if (!parsed.success) throw new ApiError("INVALID_REQUEST", parsed.error.issues[0]?.message ?? "请求参数无效", 400, false); return parsed.data; }
async function mutation<T>(dependencies: MonitorStateRouteDependencies, request: FastifyRequest, reply: FastifyReply, options: { route: string; body: unknown; topic: string; aggregateId: string; statusCode?: number }, command: (transaction: Transaction<Database>) => Promise<T>): Promise<FastifyReply> {
  const response = await withIdempotency({ database: dependencies.database, store: dependencies.idempotency }, { key: request.headers["idempotency-key"] as string, route: options.route, body: options.body }, async (transaction): Promise<StoredHttpResponse> => { const value = await command(transaction); await dependencies.outbox.append(transaction, { id: randomUUID(), topic: options.topic, aggregateId: options.aggregateId, payloadJson: value ?? { ok: true }, occurredAt: new Date() }); return { statusCode: options.statusCode ?? 200, body: value ?? { ok: true } }; });
  return reply.status(response.statusCode).send(response.body);
}
export function registerMonitorStateRoutes(app: FastifyInstance, dependencies: MonitorStateRouteDependencies): void {
  app.get("/api/v1/monitor/evaluations", (request) => dependencies.repository.listEvaluations(parse(conditionQuerySchema, request.query).conditionId));
  app.post("/api/v1/monitor/evaluations", async (request, reply) => { const body = parse(evaluationSchema, request.body) as ConditionEvaluation; return mutation(dependencies, request, reply, { route: "POST /api/v1/monitor/evaluations", body, topic: "monitor.evaluation.created", aggregateId: body.conditionId, statusCode: 201 }, (transaction) => dependencies.repository.recordEvaluation(body, transaction)); });
  app.get("/api/v1/monitor/alerts", (request) => { const query = parse(alertQuerySchema, request.query); return dependencies.repository.listAlerts({ ...query, ...(query.symbol ? { symbol: query.symbol.toUpperCase() } : {}) } as AlertListQuery); });
  app.post("/api/v1/monitor/alerts", async (request, reply) => { const body = parse(alertSchema, request.body) as MonitorAlert; return mutation(dependencies, request, reply, { route: "POST /api/v1/monitor/alerts", body, topic: "monitor.alert.created", aggregateId: body.id, statusCode: 201 }, (transaction) => dependencies.repository.recordAlert(body, transaction)); });
  app.get("/api/v1/monitor/alerts/:id", (request) => dependencies.repository.getAlert(parse(idSchema, request.params).id));
  app.get("/api/v1/monitor/alerts/:id/actions", (request) => dependencies.repository.listAlertActions(parse(idSchema, request.params).id));
  app.post("/api/v1/monitor/alerts/:id/actions", async (request, reply) => { const { id } = parse(idSchema, request.params); const body = parse(actionSchema, request.body); return mutation(dependencies, request, reply, { route: "POST /api/v1/monitor/alerts/:id/actions", body: { id, ...body }, topic: "monitor.alert.action.created", aggregateId: id, statusCode: 201 }, (transaction) => dependencies.repository.act(id, body, transaction)); });
  app.get("/api/v1/monitor/reviews", (request) => dependencies.repository.listReviews(parse(reviewQuerySchema, request.query).thesisVersionId));
  app.post("/api/v1/monitor/reviews", async (request, reply) => { const body = parse(reviewSchema, request.body); return mutation(dependencies, request, reply, { route: "POST /api/v1/monitor/reviews", body, topic: "monitor.review.created", aggregateId: body.thesisVersionId, statusCode: 201 }, (transaction) => dependencies.repository.recordReview(body as never, transaction)); });
}
