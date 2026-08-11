import { describe, expect, test, vi } from "vitest";
import { BrokerProviderError } from "./alpacaTradingProvider";
import { OrderCommandService } from "./orderCommandService";

const intent = { id:"intent-1", previewId:"preview-1", clientOrderId:"stockm-intent-1", symbol:"AAPL", side:"buy" as const, quantity:"1", type:"market" as const, timeInForce:"day" as const, confirmedAt:"2026-08-11T00:00:00.000Z", state:"pending_submission" as const, version:0, updatedAt:"2026-08-11T00:00:00.000Z" };
const remote = { remoteOrderId:"remote-1", clientOrderId:intent.clientOrderId, symbol:"AAPL", side:"buy" as const, quantity:"1", filledQuantity:"0", type:"market" as const, timeInForce:"day" as const, status:"accepted" as const, submittedAt:intent.confirmedAt, updatedAt:intent.confirmedAt };

function setup() {
  const repository = { getOrderProjection:vi.fn().mockResolvedValue(intent), bindRemoteOrder:vi.fn().mockResolvedValue(true), appendOrderEvent:vi.fn().mockResolvedValue(true) };
  const provider = { getOrderByClientOrderId:vi.fn(), submitOrder:vi.fn(), cancelOrder:vi.fn() };
  const scheduler = { reconcileOrder:vi.fn().mockResolvedValue(undefined) };
  return { repository, provider, scheduler, service:new OrderCommandService(repository, provider as never, scheduler, () => new Date(intent.confirmedAt)) };
}

describe("OrderCommandService", () => {
  test("binds an existing remote order without submitting", async () => {
    const x=setup(); x.provider.getOrderByClientOrderId.mockResolvedValue(remote);
    await x.service.submit({eventId:"evt-1", intentId:intent.id});
    expect(x.provider.submitOrder).not.toHaveBeenCalled();
    expect(x.repository.bindRemoteOrder).toHaveBeenCalledWith(expect.objectContaining({remoteOrderId:"remote-1"}));
  });
  test("submits exactly once after explicit not-found", async () => {
    const x=setup(); x.provider.getOrderByClientOrderId.mockResolvedValue(undefined); x.provider.submitOrder.mockResolvedValue(remote);
    await x.service.submit({eventId:"evt-1", intentId:intent.id});
    expect(x.provider.submitOrder).toHaveBeenCalledTimes(1);
  });
  test("lost response enters reconciling and redelivery only discovers the accepted order", async () => {
    const x=setup(); x.provider.getOrderByClientOrderId.mockResolvedValueOnce(undefined).mockResolvedValueOnce(remote);
    x.provider.submitOrder.mockRejectedValueOnce(new BrokerProviderError("timeout","timeout",true,true));
    await x.service.submit({eventId:"evt-1", intentId:intent.id});
    x.repository.getOrderProjection.mockResolvedValue({...intent,state:"reconciling"});
    await x.service.submit({eventId:"evt-1", intentId:intent.id});
    expect(x.provider.submitOrder).toHaveBeenCalledTimes(1);
    expect(x.scheduler.reconcileOrder).toHaveBeenCalled();
    expect(x.repository.bindRemoteOrder).toHaveBeenCalledTimes(1);
  });
  test("ambiguous lookup never submits and schedules reconciliation", async () => {
    const x=setup(); x.provider.getOrderByClientOrderId.mockRejectedValue(new BrokerProviderError("unavailable","down",true,true,503));
    await x.service.submit({eventId:"evt-1", intentId:intent.id});
    expect(x.provider.submitOrder).not.toHaveBeenCalled();
    expect(x.scheduler.reconcileOrder).toHaveBeenCalledWith(intent.id);
  });
});
