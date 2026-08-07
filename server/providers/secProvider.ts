import { z } from "zod";
import type { FinancialFact, SecFiling } from "../../src/features/market/apiDomain";
import type { ProviderResult } from "../core/providerTypes";
import { ProviderTimeoutError } from "../core/errors";
import { secConceptMap } from "./secConceptMap";

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
const tickerSchema = z.record(z.string(), z.object({ cik_str: z.number(), ticker: z.string() }));
const submissionsSchema = z.object({ filings: z.object({ recent: z.object({ accessionNumber: z.array(z.string()), form: z.array(z.string()), filingDate: z.array(z.string()), reportDate: z.array(z.string()), primaryDocument: z.array(z.string()) }) }) });
const factsSchema = z.object({ facts: z.object({ "us-gaap": z.record(z.string(), z.object({ units: z.record(z.string(), z.array(z.object({ fy: z.number().optional(), fp: z.string().optional(), form: z.string(), filed: z.string(), end: z.string(), start: z.string().optional(), val: z.number(), accn: z.string() }))) })) }) });

export class SecProvider {
  constructor(private readonly userAgent: string, private readonly fetcher: FetchLike = fetch) {}

  async resolveCik(symbol: string): Promise<string> {
    const payload = tickerSchema.parse(await this.json("https://www.sec.gov/files/company_tickers.json"));
    const ticker = symbol.toUpperCase();
    const item = Object.values(payload).find((entry) => entry.ticker.toUpperCase() === ticker);
    if (!item) throw new ProviderTimeoutError("sec");
    return String(item.cik_str).padStart(10, "0");
  }

  async getFilings(symbol: string): Promise<ProviderResult<SecFiling[]>> {
    const cik = await this.resolveCik(symbol);
    const payload = submissionsSchema.parse(await this.json(`https://data.sec.gov/submissions/CIK${cik}.json`));
    const supported = new Set(["10-K", "10-K/A", "10-Q", "10-Q/A", "8-K", "8-K/A"]);
    const filings = payload.filings.recent.form.flatMap((form, index) => {
      if (!supported.has(form)) return [];
      const accessionNumber = payload.filings.recent.accessionNumber[index];
      const primaryDocument = payload.filings.recent.primaryDocument[index];
      return [{ symbol: symbol.toUpperCase(), form: form as SecFiling["form"], filedAt: payload.filings.recent.filingDate[index], reportDate: payload.filings.recent.reportDate[index], accessionNumber, primaryDocument, url: `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accessionNumber.replaceAll("-", "")}/${primaryDocument}` }];
    }).sort((left, right) => right.filedAt.localeCompare(left.filedAt));
    return { source: "sec", asOf: filings[0]?.filedAt ?? new Date(0).toISOString(), data: filings };
  }

  async getFinancialFacts(symbol: string): Promise<ProviderResult<FinancialFact[]>> {
    const cik = await this.resolveCik(symbol);
    const payload = factsSchema.parse(await this.json(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`));
    const facts = Object.entries(secConceptMap).flatMap(([concept, mapped]) => {
      const item = payload.facts["us-gaap"][concept];
      if (!item) return [];
      return Object.entries(item.units).flatMap(([unit, values]) => values.filter((value) => ["10-K", "10-K/A", "10-Q", "10-Q/A"].includes(value.form)).map((value) => ({ symbol: symbol.toUpperCase(), statement: mapped.statement, concept, label: mapped.label, value: value.val, unit, periodStart: value.start, periodEnd: value.end, fiscalYear: value.fy, fiscalPeriod: value.fp, form: value.form, filedAt: value.filed, accessionNumber: value.accn })));
    }).sort((left, right) => right.periodEnd.localeCompare(left.periodEnd));
    return { source: "sec", asOf: facts[0]?.filedAt ?? new Date(0).toISOString(), data: facts };
  }

  private async json(url: string): Promise<unknown> {
    try {
      const response = await this.fetcher(url, { headers: { "User-Agent": this.userAgent, Accept: "application/json" } });
      if (!response.ok) throw new ProviderTimeoutError("sec");
      return response.json();
    } catch (error) {
      if (error instanceof ProviderTimeoutError) throw error;
      throw new ProviderTimeoutError("sec");
    }
  }
}
