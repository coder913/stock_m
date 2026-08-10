import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Kysely, Transaction } from "kysely";
import { z } from "zod";
import { ApiError } from "../core/errors";
import type { Database } from "../db/types";
import type { PushSubscriptionRepository } from "../notifications/pushSubscriptionRepository";
import type { IdempotencyStore, StoredHttpResponse } from "../platform/idempotencyRepository";
import type { OutboxRepository } from "../platform/outboxRepository";
import { withIdempotency } from "../platform/withIdempotency";

export interface NotificationRouteDependencies {
  configured: boolean;
  publicKey?: string;
  database: Kysely<Database>;
  idempotency: IdempotencyStore;
  outbox: Pick<OutboxRepository, "append">;
  repository?: Pick<PushSubscriptionRepository, "list" | "upsert" | "revoke">;
}

const subscriptionSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url(),
    expirationTime: z.number().nullable(),
    keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
  }),
  userAgent: z.string().min(1).max(512),
});
const endpointSchema = z.object({ endpointHash: z.string().regex(/^[a-f0-9]{64}$/).or(z.string().min(1)) });

function requireConfigured(dependencies: NotificationRouteDependencies): asserts dependencies is NotificationRouteDependencies & { repository: NonNullable<NotificationRouteDependencies["repository"]> } {
  if (!dependencies.configured || !dependencies.repository) throw new ApiError("NOTIFICATIONS_NOT_CONFIGURED", "Push notifications are not configured", 503, false);
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ApiError("INVALID_REQUEST", result.error.issues[0]?.message ?? "Invalid request", 400, false);
  return result.data;
}

async function mutation(
  dependencies: NotificationRouteDependencies,
  request: FastifyRequest,
  reply: FastifyReply,
  options: { route: string; body: unknown; topic: string; aggregateId: string; statusCode: number },
  command: (transaction: Transaction<Database>) => Promise<unknown>,
): Promise<FastifyReply> {
  const response = await withIdempotency(
    { database: dependencies.database, store: dependencies.idempotency },
    { key: request.headers["idempotency-key"] as string, route: options.route, body: options.body },
    async (transaction): Promise<StoredHttpResponse> => {
      const value = await command(transaction);
      await dependencies.outbox.append(transaction, { id: randomUUID(), topic: options.topic, aggregateId: options.aggregateId, payloadJson: value ?? { ok: true }, occurredAt: new Date() });
      return { statusCode: options.statusCode, body: value ?? { ok: true } };
    },
  );
  return reply.status(response.statusCode).send(response.body);
}

export function registerNotificationRoutes(app: FastifyInstance, dependencies: NotificationRouteDependencies): void {
  app.get("/api/v1/notifications/status", async () => ({
    configured: dependencies.configured,
    ...(dependencies.publicKey ? { publicKey: dependencies.publicKey } : {}),
    subscriptions: dependencies.repository ? await dependencies.repository.list() : [],
  }));

  app.post("/api/v1/notifications/subscriptions", async (request, reply) => {
    requireConfigured(dependencies);
    const body = parse(subscriptionSchema, request.body);
    return mutation(dependencies, request, reply, { route: "POST /api/v1/notifications/subscriptions", body, topic: "notification.subscription.upserted", aggregateId: body.subscription.endpoint, statusCode: 201 },
      (transaction) => dependencies.repository.upsert(body.subscription, body.userAgent, transaction));
  });

  app.delete("/api/v1/notifications/subscriptions/:endpointHash", async (request, reply) => {
    requireConfigured(dependencies);
    const { endpointHash } = parse(endpointSchema, request.params);
    return mutation(dependencies, request, reply, { route: "DELETE /api/v1/notifications/subscriptions/:endpointHash", body: { endpointHash }, topic: "notification.subscription.revoked", aggregateId: endpointHash, statusCode: 200 },
      async (transaction) => ({ revoked: await dependencies.repository.revoke(endpointHash, transaction) }));
  });

  app.post("/api/v1/notifications/test", async (request, reply) => {
    requireConfigured(dependencies);
    const body = request.body ?? {};
    return mutation(dependencies, request, reply, { route: "POST /api/v1/notifications/test", body, topic: "notification.test.requested", aggregateId: "test", statusCode: 202 },
      async () => ({ accepted: true }));
  });
}
