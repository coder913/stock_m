import type { FinancialFact } from "../market/apiDomain";
import type { MarketApiClient } from "../market/marketApiClient";
import { ResearchDataSection, useResearchRequest } from "./ResearchDataSection";

const groupFacts = (facts: FinancialFact[]) => {
  const groups = new Map<string, FinancialFact[]>();
  for (const fact of facts) {
    const key = `${fact.label}:${fact.unit}`;
    groups.set(key, [...(groups.get(key) ?? []), fact]);
  }
  return [...groups.values()].map((items) => items.sort((left, right) => left.periodEnd.localeCompare(right.periodEnd)));
};

export function FinancialTrends({ symbol, marketClient }: { symbol: string; marketClient: Pick<MarketApiClient, "getFinancials"> }) {
  const request = useResearchRequest(`${symbol}:financials`, marketClient, () => marketClient.getFinancials(symbol));
  return (
    <ResearchDataSection title="财务趋势" request={request} errorMessage="财务数据暂时不可用" emptyMessage="暂无财务数据">
      {(facts) => (
        <div className="financial-trends">
          {groupFacts(facts).map((items) => (
            <table key={`${items[0].label}:${items[0].unit}`}>
              <caption>{items[0].label}（{items[0].unit}）</caption>
              <thead><tr><th>报告期</th><th>数值</th><th>表单</th></tr></thead>
              <tbody>{items.map((fact) => (
                <tr key={`${fact.accessionNumber}:${fact.periodEnd}`}>
                  <th>{fact.periodEnd}</th><td>{fact.value.toLocaleString()}</td><td>{fact.form}</td>
                </tr>
              ))}</tbody>
            </table>
          ))}
        </div>
      )}
    </ResearchDataSection>
  );
}
