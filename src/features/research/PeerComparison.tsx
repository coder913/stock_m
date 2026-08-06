import { useEffect, useState } from "react";
import type { StockSnapshot } from "../discovery/domain";
import { mockDiscoveryRepository } from "../discovery/mockDiscoveryRepository";

interface PeerComparisonProps { peers: StockSnapshot[]; period: "TTM" | "FY1" | "mixed"; source: string; }
const metric = (value: number | undefined, suffix = "") => value === undefined ? "数据缺失" : `${value}${suffix}`;

export function PeerComparison({ peers, period, source }: PeerComparisonProps) {
  if (period === "mixed") return <section><h2>同业比较</h2><p role="alert">财务周期不一致，无法进行直接比较。</p></section>;
  return <section className="peer-comparison"><h2>同业比较</h2><p>{period} · {source}</p><table><thead><tr><th>代码</th><th>公司</th><th>营收增长</th><th>预期市盈率</th><th>营业利润率</th></tr></thead><tbody>{peers.slice(0, 5).map((peer) => <tr key={peer.symbol}><th scope="row">{peer.symbol}</th><td>{peer.name}</td><td>{metric(peer.metrics.revenueGrowthYoY, "%")}</td><td>{metric(peer.metrics.forwardPE)}</td><td>{metric(peer.metrics.operatingMargin, "%")}</td></tr>)}</tbody></table></section>;
}

export function ResearchPeerComparison({ symbol }: { symbol: string }) {
  const [peers, setPeers] = useState<StockSnapshot[]>([]);
  const [source, setSource] = useState("");
  useEffect(() => { void mockDiscoveryRepository.getPeers(symbol).then((result) => { setPeers(result.items); setSource(result.source); }).catch(() => undefined); }, [symbol]);
  if (peers.length === 0) return <section><h2>同业比较</h2><p role="status">暂无可比较的同业数据。</p></section>;
  return <PeerComparison peers={peers} period="TTM" source={source} />;
}
