import { PortfolioLedger } from "./portfolioLedger";
export interface PaperOrder { symbol:string; quantity:number; price:number; thesisVersionId:string; }
export class LocalPortfolioRepository { constructor(private storage:Storage) {}
  add(order:PaperOrder) { new PortfolioLedger(this.storage).append({ type:"buy", symbol:order.symbol, quantity:order.quantity, price:order.price, thesisVersionId:order.thesisVersionId, occurredAt:new Date().toISOString() }); }
  positions(prices:Record<string,number>){return Object.values(new PortfolioLedger(this.storage).list().reduce<Record<string,{symbol:string;quantity:number;cost:number}>>((a,x)=>{if(!x.symbol) return a; const p=a[x.symbol]??{symbol:x.symbol,quantity:0,cost:0}; if(x.type==="buy"){p.quantity+=x.quantity??0;p.cost+=(x.quantity??0)*(x.price??0);} if(x.type==="sell"){p.quantity-=x.quantity??0;p.cost-=Math.min(p.cost,(x.quantity??0)*(x.price??0));} a[x.symbol]=p;return a;},{})).map(p=>({symbol:p.symbol,quantity:p.quantity,marketValue:p.quantity*(prices[p.symbol]??0),unrealizedPnl:p.quantity*(prices[p.symbol]??0)-p.cost}));}
}
