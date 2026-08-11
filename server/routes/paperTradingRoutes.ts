import { createHash, randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Kysely, Transaction } from "kysely";
import { z } from "zod";
import type { OrderPreview, OrderPreviewClaims, PaperOrderDraft } from "../../shared/broker";
import { ApiError } from "../core/errors";
import type { Database } from "../db/types";
import type { BrokerRepository } from "../broker/brokerRepository";
import { clientOrderIdFor } from "../broker/clientOrderId";
import type { IdempotencyStore, StoredHttpResponse } from "../platform/idempotencyRepository";
import type { OutboxRepository } from "../platform/outboxRepository";
import { withIdempotency } from "../platform/withIdempotency";

const orderDraftSchema = z.object({
  symbol: z.string().min(1),
  side: z.enum(["buy", "sell"]),
  quantity: z.string().min(1),
  type: z.enum(["market", "limit"]),
  timeInForce: z.enum(["day", "gtc"]),
  limitPrice: z.string().min(1).optional(),
});
const confirmationSchema = z.object({ previewToken: z.string().min(1) });
const cancelSchema = z.object({ orderIntentId:z.string().uuid() });

export interface PaperTradingRouteDependencies {
  status: { enabled: boolean; configured: boolean };
  database: Kysely<Database>;
  idempotency: IdempotencyStore;
  outbox: Pick<OutboxRepository, "append">;
  repository: Pick<BrokerRepository, "recordPreviewAudit" | "createOrderIntent" | "createCancelIntent" | "hasActiveDrift">;
  preview: {
    preview(input: PaperOrderDraft): Promise<OrderPreview>;
    verify(token: string): OrderPreviewClaims;
  };
  now?: () => Date;
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ApiError("INVALID_REQUEST", result.error.issues[0]?.message ?? "Request is invalid", 400, false);
  return result.data;
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function idempotent(
  dependencies: PaperTradingRouteDependencies,
  request: FastifyRequest,
  reply: FastifyReply,
  route: string,
  body: unknown,
  command: (transaction: Transaction<Database>) => Promise<StoredHttpResponse>,
) {
  const response = await withIdempotency(
    { database: dependencies.database, store: dependencies.idempotency },
    { key: request.headers["idempotency-key"] as string, route, body },
    command,
  );
  return reply.status(response.statusCode).send(response.body);
}

export function registerPaperTradingRoutes(app: FastifyInstance, dependencies: PaperTradingRouteDependencies): void {
  app.get("/api/v1/broker/alpaca-paper/status", () => ({
    ...dependencies.status,
    ready: dependencies.status.enabled && dependencies.status.configured,
  }));

  app.post("/api/v1/broker/alpaca-paper/order-previews", async (request, reply) => {
    const body = parse(orderDraftSchema, request.body);
    return idempotent(dependencies, request, reply, "POST /api/v1/broker/alpaca-paper/order-previews", body, async (transaction) => {
      const preview = await dependencies.preview.preview(body);
      await dependencies.repository.recordPreviewAudit({
        previewId: preview.previewId,
        inputHash: fingerprint(body),
        normalizedOrder: preview.normalizedOrder,
        expiresAt: new Date(preview.expiresAt),
      }, transaction);
      return { statusCode: 201, body: preview };
    });
  });

  app.post("/api/v1/broker/alpaca-paper/order-intents", async (request, reply) => {
    const body = parse(confirmationSchema, request.body);
    return idempotent(dependencies, request, reply, "POST /api/v1/broker/alpaca-paper/order-intents", body, async (transaction) => {
      if (await dependencies.repository.hasActiveDrift(transaction)) {
        throw new ApiError("BROKER_DRIFT_ACTIVE", "Broker drift must be reconciled before confirming orders", 409, false);
      }
      const claims = dependencies.preview.verify(body.previewToken);
      const id = randomUUID();
      const clientOrderId = clientOrderIdFor(id);
      const intent = await dependencies.repository.createOrderIntent({
        id,
        previewId: claims.previewId,
        clientOrderId,
        ...claims.normalizedOrder,
      }, transaction);
      const result = { ...intent, status: "pending_submission" as const };
      await dependencies.outbox.append(transaction, {
        id: randomUUID(),
        topic: "broker.order.submit.requested",
        aggregateId: id,
        payloadJson: result,
        occurredAt: dependencies.now?.() ?? new Date(),
      });
      return { statusCode: 201, body: result };
    });
  });

  app.post("/api/v1/broker/alpaca-paper/cancel-intents",async(request,reply)=>{
    const body=parse(cancelSchema,request.body);
    return idempotent(dependencies,request,reply,"POST /api/v1/broker/alpaca-paper/cancel-intents",body,async(transaction)=>{
      const cancel=await dependencies.repository.createCancelIntent({id:randomUUID(),orderIntentId:body.orderIntentId},transaction);
      await dependencies.outbox.append(transaction,{id:randomUUID(),topic:"broker.order.cancel.requested",aggregateId:body.orderIntentId,payloadJson:{eventId:cancel.id,intentId:body.orderIntentId,cancelIntentId:cancel.id},occurredAt:dependencies.now?.()??new Date()});
      return {statusCode:201,body:{...cancel,status:"cancel_pending"}};
    });
  });
}
