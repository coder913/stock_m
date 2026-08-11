import { describe, expect, test, vi } from "vitest";
import { BrokerProviderError } from "./alpacaTradingProvider";
import { CancelCommandService } from "./cancelCommandService";

function setup(state="new") {
  const repository={getOrderProjection:vi.fn().mockResolvedValue({id:"i1",remoteOrderId:"r1",state}),appendOrderEvent:vi.fn().mockResolvedValue(true)};
  const provider={cancelOrder:vi.fn().mockResolvedValue(undefined)};
  const scheduler={reconcileOrder:vi.fn().mockResolvedValue(undefined)};
  return {repository,provider,scheduler,service:new CancelCommandService(repository,provider as never,scheduler,()=>new Date("2026-08-11T00:00:00Z"))};
}
describe("CancelCommandService",()=>{
  test("records the immutable cancel request, sends once, and reconciles",async()=>{const x=setup();await x.service.cancel({eventId:"e1",intentId:"i1",cancelIntentId:"c1"});expect(x.repository.appendOrderEvent).toHaveBeenCalledTimes(1);expect(x.provider.cancelOrder).toHaveBeenCalledWith("r1");expect(x.scheduler.reconcileOrder).toHaveBeenCalledWith("i1");});
  test("duplicate delivery while cancel pending does not resend",async()=>{const x=setup("cancel_pending");await x.service.cancel({eventId:"e1",intentId:"i1",cancelIntentId:"c1"});expect(x.provider.cancelOrder).not.toHaveBeenCalled();expect(x.scheduler.reconcileOrder).toHaveBeenCalled();});
  test.each(["filled","canceled","rejected","expired"])("terminal %s is a no-op",async(state)=>{const x=setup(state);await x.service.cancel({eventId:"e1",intentId:"i1",cancelIntentId:"c1"});expect(x.provider.cancelOrder).not.toHaveBeenCalled();expect(x.scheduler.reconcileOrder).not.toHaveBeenCalled();});
  test("ambiguous cancel response only schedules reconciliation",async()=>{const x=setup();x.provider.cancelOrder.mockRejectedValue(new BrokerProviderError("timeout","timeout",true,true));await x.service.cancel({eventId:"e1",intentId:"i1",cancelIntentId:"c1"});expect(x.scheduler.reconcileOrder).toHaveBeenCalledWith("i1");});
});
