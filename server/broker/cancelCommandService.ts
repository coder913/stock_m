import type { AlpacaTradingPort } from "../../shared/broker";
import { BrokerProviderError } from "./alpacaTradingProvider";
import type { BrokerRepository } from "./brokerRepository";
import type { OrderReconciliationScheduler } from "./orderCommandService";

type Repository=Pick<BrokerRepository,"getOrderProjection"|"appendOrderEvent">;
export interface CancelOrderEvent {eventId:string;intentId:string;cancelIntentId:string;}
const terminal=new Set(["filled","canceled","rejected","expired"]);
export class CancelCommandService{
 constructor(private readonly repository:Repository,private readonly provider:Pick<AlpacaTradingPort,"cancelOrder">,private readonly scheduler:OrderReconciliationScheduler,private readonly now:()=>Date=()=>new Date()){}
 async cancel(event:CancelOrderEvent):Promise<void>{
  const order=await this.repository.getOrderProjection(event.intentId);if(!order||terminal.has(order.state))return;
  if(order.state==="cancel_pending"){await this.scheduler.reconcileOrder(order.id);return;}
  if(!order.remoteOrderId){await this.scheduler.reconcileOrder(order.id);return;}
  await this.repository.appendOrderEvent({intentId:order.id,event:"command.cancel_requested",remoteEventId:`cancel:${event.cancelIntentId}`,payload:event,occurredAt:this.now()});
  try{await this.provider.cancelOrder(order.remoteOrderId);}catch(error){if(!(error instanceof BrokerProviderError)||(!error.retryable&&!error.ambiguous))throw error;}
  await this.scheduler.reconcileOrder(order.id);
 }
}
