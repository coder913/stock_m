export interface Thesis { id: string; symbol: string; coreJudgment: string; evidence: string[]; risks: string[]; validationConditions: string[]; version: number; }
export class LocalThesisRepository { constructor(private storage: Storage) {} private key = "stock_m:theses";
  getHistory(symbol: string): Thesis[] { return (JSON.parse(this.storage.getItem(this.key) || "[]") as Thesis[]).filter(x => x.symbol === symbol); }
  save(input: Omit<Thesis, "id" | "version">): Thesis { if (!input.coreJudgment || !input.evidence.length || !input.risks.length || !input.validationConditions.length) throw new Error("请完整填写投资逻辑"); const history=this.getHistory(input.symbol); const item={...input,id:crypto.randomUUID(),version:history.length+1}; const all=JSON.parse(this.storage.getItem(this.key)||"[]"); this.storage.setItem(this.key,JSON.stringify([...all,item])); return item; }
}
