// @vitest-environment node
import {afterAll,beforeAll,beforeEach,expect,test,vi} from "vitest";
import {createDatabase} from "../db/database";
import {migrateToLatest} from "../db/migrate";
import {resetTestDatabase} from "../testing/resetTestDatabase";
import {BrokerProviderError} from "./alpacaTradingProvider";
import {BrokerRepository} from "./brokerRepository";
import {OrderCommandService} from "./orderCommandService";
const database=createDatabase(process.env.TEST_DATABASE_URL??"postgresql://stock_m:stock_m@127.0.0.1:55432/stock_m_test");
const now=()=>new Date("2026-08-11T14:00:00Z");
beforeAll(()=>migrateToLatest(database));beforeEach(()=>resetTestDatabase(database));afterAll(()=>database.destroy());
test("a lost submit response converges by client id without creating a second remote order",async()=>{
 const repository=new BrokerRepository(database,now);const intent=await repository.createOrderIntent({id:"00000000-0000-4000-8000-000000000501",previewId:"00000000-0000-4000-8000-000000000502",clientOrderId:"stockm-lost-response",symbol:"AAPL",side:"buy",quantity:"1",type:"market",timeInForce:"day"});
 const remote={remoteOrderId:"alpaca-501",clientOrderId:intent.clientOrderId,symbol:"AAPL",side:"buy" as const,quantity:"1",filledQuantity:"0",type:"market" as const,timeInForce:"day" as const,status:"accepted" as const,submittedAt:now().toISOString(),updatedAt:now().toISOString()};
 const provider={getOrderByClientOrderId:vi.fn().mockResolvedValueOnce(undefined).mockResolvedValueOnce(remote),submitOrder:vi.fn().mockRejectedValueOnce(new BrokerProviderError("timeout","timeout",true,true))};
 const scheduler={reconcileOrder:vi.fn().mockResolvedValue(undefined)};const service=new OrderCommandService(repository,provider as never,scheduler,now);
 await service.submit({eventId:"event-501",intentId:intent.id});await service.submit({eventId:"event-501",intentId:intent.id});
 expect(provider.submitOrder).toHaveBeenCalledTimes(1);expect(await repository.getOrderProjection(intent.id)).toMatchObject({remoteOrderId:"alpaca-501",state:"accepted"});
});
