import type { MarketApiClient } from "../market/marketApiClient";
import { ResearchDataSection, useResearchRequest } from "./ResearchDataSection";

export function FilingsList({ symbol, marketClient }: { symbol: string; marketClient: Pick<MarketApiClient, "getFilings"> }) {
  const request = useResearchRequest(`${symbol}:filings`, marketClient, () => marketClient.getFilings(symbol));
  return (
    <ResearchDataSection title="监管文件" request={request} errorMessage="监管文件暂时不可用" emptyMessage="暂无监管文件">
      {(filings) => (
        <ul>{filings.map((filing) => (
          <li key={filing.accessionNumber}>
            {filing.filedAt} · <a href={filing.url} target="_blank" rel="noreferrer">查看 {filing.form} 原文</a>
          </li>
        ))}</ul>
      )}
    </ResearchDataSection>
  );
}
