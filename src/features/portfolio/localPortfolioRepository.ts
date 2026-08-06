export interface PaperOrder { symbol:string; quantity:number; price:number; thesisVersionId:string; }
export class LocalPortfolioRepository { constructor(private storage:Storage) {} private key="stock_m:orders";
  add(order:PaperOrder) { if(!order.thesisVersionId) throw new Error("必须关联投资逻辑"); if(order.quantity<=0||order.price<=0) throw new Error("数量和价格必须大于零"); const all=this.orders(); this.storage.setItem(this.key,JSON.stringify([...all,order])); }
  private orders():PaperOrder[]{return JSON.parse(this.storage.getItem(this.key)||"[]");}
  positions(prices:Record<string,number>){return Object.values(this.orders().reduce<Record<string,{symbol:string;quantity:number;cost:number}>>((a,x)=>{const p=a[x.symbol]??{symbol:x.symbol,quantity:0,cost:0};p.quantity+=x.quantity;p.cost+=x.quantity*x.price;a[x.symbol]=p;return a;},{})).map(p=>({symbol:p.symbol,quantity:p.quantity,marketValue:p.quantity*(prices[p.symbol]??0),unrealizedPnl:p.quantity*(prices[p.symbol]??0)-p.cost}));}
}
