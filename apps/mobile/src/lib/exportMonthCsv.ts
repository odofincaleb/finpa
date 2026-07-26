import { Share } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import type { MonthSummary } from "./monthSummary";
import type { Transaction } from "../types";

function csvEscape(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function monthFileStamp(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function buildMonthStatementCsv(
  summary: MonthSummary,
  transactions: Transaction[],
  year: number,
  month: number,
): string {
  const start = new Date(year, month - 1, 1).getTime();
  const end = new Date(year, month, 1).getTime();
  const monthTx = transactions
    .filter((t) => {
      const ts = new Date(t.created_at).getTime();
      return ts >= start && ts < end;
    })
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  const period = new Date(year, month - 1, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  const lines: string[] = [];
  lines.push("FINPA Monthly Statement");
  lines.push(`Period,${csvEscape(period)}`);
  lines.push(`Income,${csvEscape(summary.income)}`);
  lines.push(`Expenses,${csvEscape(summary.expenses)}`);
  lines.push(`Net,${csvEscape(summary.net)}`);
  lines.push(`Total budget,${csvEscape(summary.totalBudget)}`);
  lines.push(
    `Budget used %,${
      summary.budgetUsedPercent == null
        ? ""
        : csvEscape(summary.budgetUsedPercent.toFixed(1))
    }`,
  );
  lines.push("");
  lines.push("Category,Spent,Percent,Budget,Remaining");
  for (const row of summary.byCategory) {
    lines.push(
      [
        csvEscape(row.category),
        csvEscape(row.amount),
        csvEscape(row.percent.toFixed(1)),
        csvEscape(row.budget),
        csvEscape(row.remaining),
      ].join(","),
    );
  }
  lines.push("");
  lines.push("Date,Type,Amount,Category,Merchant,Payment,Notes");
  for (const t of monthTx) {
    lines.push(
      [
        csvEscape(t.created_at.slice(0, 10)),
        csvEscape(t.type),
        csvEscape(t.amount),
        csvEscape(t.category),
        csvEscape(t.merchant),
        csvEscape(t.payment_method),
        csvEscape(t.notes),
      ].join(","),
    );
  }
  if (summary.insights?.length) {
    lines.push("");
    lines.push("Insights");
    for (const tip of summary.insights) {
      lines.push(csvEscape(tip));
    }
  }
  return lines.join("\n");
}

export async function shareMonthStatementCsv(
  summary: MonthSummary,
  transactions: Transaction[],
  year: number,
  month: number,
): Promise<void> {
  const csv = buildMonthStatementCsv(summary, transactions, year, month);
  const filename = `FINPA-statement-${monthFileStamp(year, month)}.csv`;

  try {
    const dir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
    if (dir && (await Sharing.isAvailableAsync())) {
      const path = `${dir}${filename}`;
      await FileSystem.writeAsStringAsync(path, csv, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      await Sharing.shareAsync(path, {
        mimeType: "text/csv",
        dialogTitle: "Share FINPA statement",
        UTI: "public.comma-separated-values-text",
      });
      return;
    }
  } catch {
    // fall through to text share
  }

  await Share.share({
    title: filename,
    message: csv,
  });
}
