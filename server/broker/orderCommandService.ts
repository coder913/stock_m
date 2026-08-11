import type { AlpacaTradingPort, BrokerOrder } from "../../shared/broker";
import { BrokerProviderError } from "./alpacaTradingProvider";
import type { BrokerRepository, OrderProjectionView } from "./brokerRepository";

type Repository = Pick<BrokerRepository,"getOrderProjection"|"bindRemoteOrder"|"appendOrderEvent">;
export interface OrderReconciliationScheduler { reconcileOrder(intentId:string):Promise<unknown>; }
export interface SubmitOrderEvent { eventId:string; intentId:string; }

const terminal=new Set(["filled","canceled","rejected","expired"]);
function remoteEvent(order:BrokerOrder){return `remote.${order.status}` as const;}

export class OrderCommandService {
  constructor(private readonly repository:Repository,private readonly provider:Pick<AlpacaTradingPort,"getOrderByClientOrderId"|"submitOrder">,private readonly scheduler:OrderReconciliationScheduler,private readonly now:()=>Date=()=>new Date()){}
  async submit(event:SubmitOrderEvent):Promise<void>{
    const intent=await this.repository.getOrderProjection(event.intentId);
    if(!intent || terminal.has(intent.state)) return;
    let found:BrokerOrder|undefined;
    try { found=await this.provider.getOrderByClientOrderId(intent.clientOrderId); }
    catch(error){
      if(error instanceof BrokerProviderError && (error.retryable||error.ambiguous)){await this.markReconciling(intent,event.eventId,error);return;}
      throw error;
    }
    if(found){await this.observe(intent,found);return;}
    if(intent.state==="reconciling"){await this.scheduler.reconcileOrder(intent.id);return;}
    try { await this.observe(intent,await this.provider.submitOrder({clientOrderId:intent.clientOrderId,symbol:intent.symbol,side:intent.side,quantity:intent.quantity,type:intent.type,timeInForce:intent.timeInForce,limitPrice:intent.limitPrice})); }
    catch(error){
      if(error instanceof BrokerProviderError && error.ambiguous){await this.markReconciling(intent,event.eventId,error);return;}
      throw error;
    }
  }
  private async observe(intent:OrderProjectionView,order:BrokerOrder){
    await this.repository.bindRemoteOrder({intentId:intent.id,remoteOrderId:order.remoteOrderId,raw:order});
    await this.repository.appendOrderEvent({intentId:intent.id,event:remoteEvent(order),remoteEventId:`order:${order.remoteOrderId}:${order.status}:${order.updatedAt}`,payload:order,occurredAt:new Date(order.updatedAt)});
  }
  private async markReconciling(intent:OrderProjectionView,eventId:string,error:BrokerProviderError){
    if(intent.state==="pending_submission") await this.repository.appendOrderEvent({intentId:intent.id,event:"command.reconciling",remoteEventId:`reconcile:${eventId}`,payload:{code:error.code},occurredAt:this.now()});
    await this.scheduler.reconcileOrder(intent.id);
  }
}
