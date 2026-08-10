export interface Thesis {
  id: string;
  symbol: string;
  coreJudgment: string;
  evidence: string[];
  risks: string[];
  validationConditions: string[];
  version: number;
  createdAt: string;
}

export type ThesisDraft = Omit<Thesis, "id" | "version" | "createdAt">;
