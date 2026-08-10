export interface XirrCashFlow { at: string; amount: number; }

const minimumRate = -0.999999;
const maximumRate = 1000;
const millisecondsPerYear = 365.2425 * 24 * 60 * 60 * 1000;

export function solveXirr(cashFlows: XirrCashFlow[]): number | undefined {
  if (cashFlows.length < 2 || !cashFlows.some((flow) => flow.amount < 0) || !cashFlows.some((flow) => flow.amount > 0)) return undefined;
  const parsed = cashFlows.map((flow) => ({ at: new Date(flow.at).getTime(), amount: flow.amount }));
  if (parsed.some((flow) => Number.isNaN(flow.at) || !Number.isFinite(flow.amount))) return undefined;
  const origin = Math.min(...parsed.map((flow) => flow.at));
  const values = parsed.map((flow) => ({ amount: flow.amount, years: (flow.at - origin) / millisecondsPerYear }));
  const npv = (rate: number) => values.reduce((sum, flow) => sum + flow.amount / ((1 + rate) ** flow.years), 0);
  const derivative = (rate: number) => values.reduce((sum, flow) => sum - (flow.years * flow.amount) / ((1 + rate) ** (flow.years + 1)), 0);

  let rate = 0.1;
  for (let iteration = 0; iteration < 50; iteration += 1) {
    const value = npv(rate);
    if (Math.abs(value) < 1e-8) return rate;
    const slope = derivative(rate);
    if (!Number.isFinite(slope) || Math.abs(slope) < 1e-14) break;
    const next = rate - value / slope;
    if (!Number.isFinite(next) || next <= minimumRate || next > maximumRate) break;
    rate = next;
  }

  let low = minimumRate;
  let high = maximumRate;
  let lowValue = npv(low);
  let highValue = npv(high);
  if (!Number.isFinite(lowValue) || !Number.isFinite(highValue) || lowValue * highValue > 0) return undefined;
  for (let iteration = 0; iteration < 50; iteration += 1) {
    const middle = (low + high) / 2;
    const middleValue = npv(middle);
    if (Math.abs(middleValue) < 1e-8) return middle;
    if (lowValue * middleValue <= 0) {
      high = middle;
      highValue = middleValue;
    } else {
      low = middle;
      lowValue = middleValue;
    }
  }
  return undefined;
}
