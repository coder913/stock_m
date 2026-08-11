import { randomUUID } from "node:crypto";
import type { Kysely, Transaction } from "kysely";
import type { PaperOrderType, PaperTimeInForce } from "../../shared/broker";
import type { Database } from "../db/types";
import { transition, type LocalOrderState, type OrderLifecycleEvent } from "./orderStateMachine";

type Executor = Kysely<Database> | Transaction<Database>;

export interface NewOrderIntent {
  id: string;
  previewId: string;
  clientOrderId: string;
  symbol: string;
  side: "buy" | "sell";
  quantity: string;
  type: PaperOrderType;
  timeInForce: PaperTimeInForce;
  limitPrice?: string;
}

export interface OrderIntentView extends NewOrderIntent {
  confirmedAt: string;
}

export interface CancelIntentView { id:string; orderIntentId:string; createdAt:string; }

export interface OrderProjectionView extends OrderIntentView {
  state: LocalOrderState;
  version: number;
  remoteOrderId?: string;
  updatedAt: string;
}

export class BrokerRepository {
  constructor(private readonly database: Kysely<Database>, private readonly now: () => Date = () => new Date()) {}

  async createOrderIntent(input: NewOrderIntent, executor?: Transaction<Database>): Promise<OrderIntentView> {
    const confirmedAt = this.now();
    const persist = async (transaction: Executor) => {
      await transaction.insertInto("broker.order_intent").values({
        id: input.id,
        previewId: input.previewId,
        clientOrderId: input.clientOrderId,
        symbol: input.symbol.toUpperCase(),
        side: input.side,
        quantity: input.quantity,
        orderType: input.type,
        timeInForce: input.timeInForce,
        limitPrice: input.limitPrice ?? null,
        confirmedAt,
      }).execute();
      await transaction.insertInto("broker.order_projection").values({
        orderIntentId: input.id,
        state: "pending_submission",
        version: 0,
        updatedAt: confirmedAt,
      }).execute();
    };
    if (executor) await persist(executor);
    else await this.database.transaction().execute(persist);
    return { ...input, symbol: input.symbol.toUpperCase(), confirmedAt: confirmedAt.toISOString() };
  }

  async createCancelIntent(input:{id:string;orderIntentId:string},executor:Executor=this.database):Promise<CancelIntentView>{
    const createdAt=this.now();
    await executor.insertInto("broker.cancel_intent").values({id:input.id,orderIntentId:input.orderIntentId,createdAt}).execute();
    return {...input,createdAt:createdAt.toISOString()};
  }

  async recordPreviewAudit(input: {
    previewId: string;
    inputHash: string;
    normalizedOrder: unknown;
    expiresAt: Date;
  }, executor: Executor = this.database): Promise<void> {
    await executor.insertInto("broker.order_preview_audit").values({
      id: input.previewId,
      inputHash: input.inputHash,
      normalizedOrderJson: JSON.stringify(input.normalizedOrder),
      expiresAt: input.expiresAt,
      createdAt: this.now(),
    }).execute();
  }

  async hasActiveDrift(executor: Executor = this.database): Promise<boolean> {
    const row = await executor.selectFrom("broker.drift").select("id").where("clearedAt", "is", null).limit(1).executeTakeFirst();
    return Boolean(row);
  }

  async appendOrderEvent(input: {
    intentId: string;
    event: OrderLifecycleEvent;
    remoteEventId?: string;
    payload?: unknown;
    occurredAt: Date;
  }): Promise<boolean> {
    return this.database.transaction().execute(async (transaction) => {
      const projection = await transaction.selectFrom("broker.order_projection").selectAll()
        .where("orderIntentId", "=", input.intentId).forUpdate().executeTakeFirstOrThrow();
      const inserted = await transaction.insertInto("broker.order_event").values({
        id: randomUUID(),
        orderIntentId: input.intentId,
        remoteEventId: input.remoteEventId ?? null,
        event: input.event,
        payloadJson: JSON.stringify(input.payload ?? {}),
        occurredAt: input.occurredAt,
        createdAt: this.now(),
      }).onConflict((conflict) => conflict.column("remoteEventId").doNothing())
        .returning("id").executeTakeFirst();
      if (!inserted) return false;
      const nextState = transition(projection.state as LocalOrderState, input.event);
      await transaction.updateTable("broker.order_projection").set({
        state: nextState,
        version: projection.version + 1,
        updatedAt: this.now(),
      }).where("orderIntentId", "=", input.intentId).execute();
      return true;
    });
  }

  async getOrderProjection(intentId: string): Promise<OrderProjectionView | undefined> {
    const row = await this.database.selectFrom("broker.order_intent as intent")
      .innerJoin("broker.order_projection as projection", "projection.orderIntentId", "intent.id")
      .leftJoin("broker.remote_order as remote", "remote.orderIntentId", "intent.id")
      .select([
        "intent.id", "intent.previewId", "intent.clientOrderId", "intent.symbol", "intent.side", "intent.quantity",
        "intent.orderType", "intent.timeInForce", "intent.limitPrice", "intent.confirmedAt",
        "projection.state", "projection.version", "projection.updatedAt", "remote.remoteOrderId",
      ]).where("intent.id", "=", intentId).executeTakeFirst();
    if (!row) return undefined;
    return {
      id: row.id,
      previewId: row.previewId,
      clientOrderId: row.clientOrderId,
      symbol: row.symbol,
      side: row.side,
      quantity: row.quantity,
      type: row.orderType,
      timeInForce: row.timeInForce,
      limitPrice: row.limitPrice ?? undefined,
      confirmedAt: row.confirmedAt.toISOString(),
      state: row.state as LocalOrderState,
      version: row.version,
      remoteOrderId: row.remoteOrderId ?? undefined,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async countOrderEvents(intentId: string): Promise<number> {
    const result = await this.database.selectFrom("broker.order_event")
      .select(({ fn }) => fn.countAll<number>().as("count"))
      .where("orderIntentId", "=", intentId).executeTakeFirstOrThrow();
    return Number(result.count);
  }

  async bindRemoteOrder(input: { intentId: string; remoteOrderId: string; raw: unknown }): Promise<boolean> {
    const inserted = await this.database.insertInto("broker.remote_order").values({
      remoteOrderId: input.remoteOrderId,
      orderIntentId: input.intentId,
      rawJson: JSON.stringify(input.raw),
      firstObservedAt: this.now(),
      lastObservedAt: this.now(),
    }).onConflict((conflict) => conflict.column("remoteOrderId").doNothing()).returning("remoteOrderId").executeTakeFirst();
    return Boolean(inserted);
  }

  async insertFill(input: { remoteFillId:string; remoteOrderId:string; symbol:string; side:"buy"|"sell"; quantity:string; price:string; occurredAt:Date; raw:unknown }): Promise<boolean> {
    const inserted = await this.database.insertInto("broker.fill").values({
      remoteFillId: input.remoteFillId, remoteOrderId: input.remoteOrderId, symbol: input.symbol.toUpperCase(), side: input.side,
      quantity: input.quantity, price: input.price, occurredAt: input.occurredAt, rawJson: JSON.stringify(input.raw),
    }).onConflict((conflict) => conflict.column("remoteFillId").doNothing()).returning("remoteFillId").executeTakeFirst();
    return Boolean(inserted);
  }

  async insertActivity(input: { remoteActivityId:string; type:string; symbol?:string; amount?:string; quantity?:string; price?:string; occurredAt:Date; raw:unknown }): Promise<boolean> {
    const inserted = await this.database.insertInto("broker.activity").values({
      remoteActivityId: input.remoteActivityId, activityType: input.type, symbol: input.symbol?.toUpperCase() ?? null,
      amount: input.amount ?? null, quantity: input.quantity ?? null, price: input.price ?? null,
      occurredAt: input.occurredAt, rawJson: JSON.stringify(input.raw),
    }).onConflict((conflict) => conflict.column("remoteActivityId").doNothing()).returning("remoteActivityId").executeTakeFirst();
    return Boolean(inserted);
  }

  async getFill(remoteFillId: string) {
    return this.database.selectFrom("broker.fill").selectAll().where("remoteFillId", "=", remoteFillId).executeTakeFirst();
  }

  async getActivity(remoteActivityId: string) {
    return this.database.selectFrom("broker.activity").selectAll().where("remoteActivityId", "=", remoteActivityId).executeTakeFirst();
  }
}
