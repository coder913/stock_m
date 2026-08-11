import { pathToFileURL } from "node:url";
import { UnrecoverableError,type Job } from "bullmq";
import { AlpacaTradingProvider } from "../broker/alpacaTradingProvider";
import { BrokerRepository } from "../broker/brokerRepository";
import { CancelCommandService } from "../broker/cancelCommandService";
import { OrderCommandService } from "../broker/orderCommandService";
import {PostgresBrokerReconciliationRepository}from"../broker/brokerReconciliationRepository";
import {ReconciliationService}from"../broker/reconciliationService";
import {startAlpacaTradeUpdateStream}from"../broker/alpacaTradeUpdates";
import { queueNames } from "../queue/queueNames";
import { runWorker } from "./workerRuntime";

interface Commands{submit(event:{eventId:string;intentId:string}):Promise<void>;cancel(event:{eventId:string;intentId:string;cancelIntentId:string}):Promise<void>;reconcileFull?():Promise<void>}
export function createTradingJobProcessor(commands:Commands):(job:Job)=>Promise<void>{return async(job)=>{
 const body=job.data as Record<string,unknown>;const eventId=String(job.id??body.eventId??"");
 if(job.name==="broker.order.submit.requested"){await commands.submit({eventId,intentId:String(body.id??body.intentId)});return;}
 if(job.name==="broker.order.cancel.requested"){await commands.cancel({eventId,intentId:String(body.intentId),cancelIntentId:String(body.cancelIntentId)});return;}
 if(job.name==="broker.order.reconcile.requested"){await commands.submit({eventId,intentId:String(body.intentId)});return;}
 if(job.name==="broker.reconciliation.requested"){await commands.reconcileFull?.();return;}
 throw new UnrecoverableError(`Unsupported trading job: ${job.name}`);
};}
export async function startTradingWorker():Promise<void>{await runWorker({worker:"trading",queueName:queueNames.tradingCommands,concurrency:1,initialize:async({config,database,queue})=>{
 if(!config.paperTrading.enabled||!config.paperTrading.configured||!config.secrets.alpaca)throw new Error("Alpaca Paper trading is not enabled and configured");
 const provider=new AlpacaTradingProvider({baseUrl:config.paperTrading.baseUrl,...config.secrets.alpaca});const repository=new BrokerRepository(database);const reconciliationRepository=new PostgresBrokerReconciliationRepository(database);const reconciliation=new ReconciliationService(provider,reconciliationRepository);
 const scheduler={reconcileOrder:(intentId:string)=>queue.add("broker.order.reconcile.requested",{intentId},{delay:1000,jobId:`reconcile-${intentId}-${Date.now()}`})};
 await reconciliation.reconcileAll();setInterval(()=>void reconciliation.reconcileOrders(),30000).unref?.();setInterval(()=>void reconciliation.reconcileAll(),300000).unref?.();startAlpacaTradeUpdateStream({...config.secrets.alpaca,observe:(order)=>reconciliationRepository.observeOrder(order)});
 return createTradingJobProcessor({submit:(event)=>new OrderCommandService(repository,provider,scheduler).submit(event),cancel:(event)=>new CancelCommandService(repository,provider,scheduler).cancel(event),reconcileFull:()=>reconciliation.reconcileAll().then(()=>undefined)});
}});}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await startTradingWorker();
