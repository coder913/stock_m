import { expect, test } from "vitest";
import {
  MONEY_DECIMAL_SCALE,
  QUANTITY_DECIMAL_SCALE,
  formatFixedDecimal,
  multiplyFixedDecimal,
  parseFixedDecimal,
  subtractFixedDecimal,
} from "./fixedDecimal";

test("parses and formats canonical eight-decimal values", () => {
  expect(formatFixedDecimal(parseFixedDecimal("0.1"))).toBe("0.10000000");
  expect(formatFixedDecimal(parseFixedDecimal("-12.34000000"))).toBe("-12.34000000");
});

test("preserves Alpaca fractional quantities at nine decimals", () => {
  expect(formatFixedDecimal(parseFixedDecimal("0.000000001", QUANTITY_DECIMAL_SCALE), QUANTITY_DECIMAL_SCALE)).toBe("0.000000001");
  expect(() => parseFixedDecimal("0.000000001", MONEY_DECIMAL_SCALE)).toThrow("INVALID_FIXED_DECIMAL");
});

test("multiplies without binary floating-point error or safe-integer loss", () => {
  expect(multiplyFixedDecimal("0.1", "0.2")).toBe("0.02000000");
  expect(multiplyFixedDecimal("9007199254740991", "0.00000001", {
    leftScale: QUANTITY_DECIMAL_SCALE,
    rightScale: MONEY_DECIMAL_SCALE,
    resultScale: MONEY_DECIMAL_SCALE,
  })).toBe("90071992.54740991");
});

test("rounds half of the smallest unit away from zero", () => {
  expect(multiplyFixedDecimal("0.00000001", "0.5")).toBe("0.00000001");
  expect(multiplyFixedDecimal("-0.00000001", "0.5")).toBe("-0.00000001");
});

test("subtracts exact decimal values", () => {
  expect(subtractFixedDecimal("0.3", "0.2")).toBe("0.10000000");
});

test.each(["", ".1", "01", "1e-8", "1.000000001", "NaN"])("rejects invalid fixed decimal %j", (value) => {
  expect(() => parseFixedDecimal(value)).toThrow("INVALID_FIXED_DECIMAL");
});
