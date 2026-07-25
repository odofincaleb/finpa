import { CURRENCY_SYMBOLS, type CurrencyCode } from "../types";

export function formatMoney(
  amount: number,
  currency: string = "NGN",
  compact = false,
): string {
  const code = (currency in CURRENCY_SYMBOLS ? currency : "NGN") as CurrencyCode;
  const symbol = CURRENCY_SYMBOLS[code];
  const abs = Math.abs(amount);
  const formatted = compact
    ? new Intl.NumberFormat("en-NG", {
        notation: abs >= 10000 ? "compact" : "standard",
        maximumFractionDigits: abs >= 10000 ? 1 : 2,
      }).format(abs)
    : new Intl.NumberFormat("en-NG", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(abs);

  const sign = amount < 0 ? "-" : "";
  return `${sign}${symbol}${formatted}`;
}

export function currencyLabel(code: CurrencyCode): string {
  const labels: Record<CurrencyCode, string> = {
    NGN: "Naira (₦)",
    USD: "US Dollar ($)",
    EUR: "Euro (€)",
    GBP: "British Pound (£)",
    GHS: "Ghana Cedi (₵)",
    KES: "Kenyan Shilling",
    ZAR: "South African Rand",
  };
  return labels[code];
}
