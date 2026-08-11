export const MONEY_DECIMAL_SCALE = 8;
export const QUANTITY_DECIMAL_SCALE = 9;

const fixedDecimalPattern = /^-?(?:0|[1-9]\d*)(?:\.(\d+))?$/;

function scaleFactor(scale: number): bigint {
  if (!Number.isInteger(scale) || scale < 0) throw new Error(`INVALID_FIXED_DECIMAL_SCALE:${scale}`);
  return 10n ** BigInt(scale);
}

export function parseFixedDecimal(value: string, scale = MONEY_DECIMAL_SCALE): bigint {
  const match = fixedDecimalPattern.exec(value);
  const fraction = match?.[1] ?? "";
  if (!match || fraction.length > scale) throw new Error(`INVALID_FIXED_DECIMAL:${value}`);
  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const [whole] = unsigned.split(".");
  const scaled = BigInt(whole) * scaleFactor(scale) + BigInt(fraction.padEnd(scale, "0") || "0");
  return negative ? -scaled : scaled;
}

export function formatFixedDecimal(value: bigint, scale = MONEY_DECIMAL_SCALE): string {
  const factor = scaleFactor(scale);
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  if (scale === 0) return `${sign}${absolute}`;
  return `${sign}${absolute / factor}.${String(absolute % factor).padStart(scale, "0")}`;
}

export interface FixedDecimalMultiplicationScales {
  leftScale?: number;
  rightScale?: number;
  resultScale?: number;
}

export function multiplyFixedDecimalValues(
  left: bigint,
  right: bigint,
  scales: FixedDecimalMultiplicationScales = {},
): bigint {
  const leftScale = scales.leftScale ?? MONEY_DECIMAL_SCALE;
  const rightScale = scales.rightScale ?? MONEY_DECIMAL_SCALE;
  const resultScale = scales.resultScale ?? MONEY_DECIMAL_SCALE;
  const scaleDifference = leftScale + rightScale - resultScale;
  const product = left * right;
  if (scaleDifference <= 0) return product * scaleFactor(-scaleDifference);
  const divisor = scaleFactor(scaleDifference);
  const sign = product < 0n ? -1n : 1n;
  const absolute = product < 0n ? -product : product;
  return sign * ((absolute + divisor / 2n) / divisor);
}

export function multiplyFixedDecimal(
  left: string,
  right: string,
  scales: FixedDecimalMultiplicationScales = {},
): string {
  const leftScale = scales.leftScale ?? MONEY_DECIMAL_SCALE;
  const rightScale = scales.rightScale ?? MONEY_DECIMAL_SCALE;
  const resultScale = scales.resultScale ?? MONEY_DECIMAL_SCALE;
  return formatFixedDecimal(
    multiplyFixedDecimalValues(parseFixedDecimal(left, leftScale), parseFixedDecimal(right, rightScale), scales),
    resultScale,
  );
}

export function subtractFixedDecimal(left: string, right: string, scale = MONEY_DECIMAL_SCALE): string {
  return formatFixedDecimal(parseFixedDecimal(left, scale) - parseFixedDecimal(right, scale), scale);
}

export function negateFixedDecimal(value: string, scale = MONEY_DECIMAL_SCALE): string {
  return formatFixedDecimal(-parseFixedDecimal(value, scale), scale);
}
