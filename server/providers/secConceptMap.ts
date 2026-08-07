import type { FinancialFact } from "../../src/features/market/apiDomain";

export const secConceptMap: Record<string, Pick<FinancialFact, "statement" | "label">> = {
  Revenues: { statement: "income", label: "营业收入" },
  RevenueFromContractWithCustomerExcludingAssessedTax: { statement: "income", label: "营业收入" },
  NetIncomeLoss: { statement: "income", label: "净利润" },
  Assets: { statement: "balance-sheet", label: "总资产" },
  Liabilities: { statement: "balance-sheet", label: "总负债" },
  NetCashProvidedByUsedInOperatingActivities: { statement: "cash-flow", label: "经营现金流" },
  PaymentsToAcquirePropertyPlantAndEquipment: { statement: "cash-flow", label: "资本开支" },
};
