import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useNavigation } from "@react-navigation/native";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Download,
} from "lucide-react-native";
import { useAuth } from "../context/AuthContext";
import { useFinance } from "../context/FinanceContext";
import { useTheme } from "../context/ThemeContext";
import { formatMoney } from "../lib/currency";
import { shareMonthStatementCsv } from "../lib/exportMonthCsv";
import { computeMonthSummary } from "../lib/monthSummary";
import type { BudgetActualRow } from "../types";
import type { ThemeColors } from "../theme/colors";

function monthLabel(year: number, month: number) {
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

export function SummaryScreen() {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { profile } = useAuth();
  const { transactions, budgetRows, getBudgetsForMonth } = useFinance();
  const currency = profile?.preferred_currency ?? "NGN";

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [monthBudgets, setMonthBudgets] = useState<BudgetActualRow[]>(budgetRows);
  const [loadingMonth, setLoadingMonth] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [fadeKey, setFadeKey] = useState(0);

  const isCurrentMonth =
    year === now.getFullYear() && month === now.getMonth() + 1;
  const canGoNext = !isCurrentMonth;

  const shiftMonth = (delta: number) => {
    const d = new Date(year, month - 1 + delta, 1);
    const nextY = d.getFullYear();
    const nextM = d.getMonth() + 1;
    if (
      nextY > now.getFullYear() ||
      (nextY === now.getFullYear() && nextM > now.getMonth() + 1)
    ) {
      return;
    }
    setYear(nextY);
    setMonth(nextM);
    setFadeKey((k) => k + 1);
  };

  const loadBudgets = useCallback(async () => {
    if (isCurrentMonth) {
      setMonthBudgets(budgetRows);
      return;
    }
    setLoadingMonth(true);
    try {
      const rows = await getBudgetsForMonth(year, month);
      setMonthBudgets(rows);
    } finally {
      setLoadingMonth(false);
    }
  }, [isCurrentMonth, budgetRows, getBudgetsForMonth, year, month]);

  useEffect(() => {
    void loadBudgets();
  }, [loadBudgets]);

  const summary = useMemo(
    () =>
      computeMonthSummary(transactions, monthBudgets, year, month, currency),
    [transactions, monthBudgets, year, month, currency],
  );

  const maxCategory = summary.byCategory[0]?.amount ?? 0;

  const downloadStatement = async () => {
    setExporting(true);
    try {
      await shareMonthStatementCsv(summary, transactions, year, month);
    } catch (err) {
      Alert.alert(
        "Export failed",
        err instanceof Error ? err.message : "Could not share statement",
      );
    } finally {
      setExporting(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <StatusBar style={colors.statusBar} />
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={() => navigation.goBack()} style={styles.back}>
          <ArrowLeft size={20} color={colors.mist} />
          <Text style={styles.backText}>Back</Text>
        </Pressable>

        <Text style={styles.title}>Monthly summary</Text>

        <Pressable
          style={styles.exportBtn}
          onPress={() => void downloadStatement()}
          disabled={exporting || loadingMonth}
        >
          {exporting ? (
            <ActivityIndicator color={colors.ink} size="small" />
          ) : (
            <>
              <Download size={16} color={colors.ink} />
              <Text style={styles.exportText}>Download CSV statement</Text>
            </>
          )}
        </Pressable>

        <View style={styles.monthNav}>
          <Pressable
            onPress={() => shiftMonth(-1)}
            style={styles.monthBtn}
            hitSlop={8}
          >
            <ChevronLeft size={22} color={colors.mist} />
          </Pressable>
          <Text style={styles.monthLabel}>{monthLabel(year, month)}</Text>
          <Pressable
            onPress={() => shiftMonth(1)}
            style={[styles.monthBtn, !canGoNext && styles.monthBtnDisabled]}
            disabled={!canGoNext}
            hitSlop={8}
          >
            <ChevronRight
              size={22}
              color={canGoNext ? colors.mist : colors.mistMuted}
            />
          </Pressable>
        </View>

        {loadingMonth ? (
          <ActivityIndicator
            color={colors.sageBright}
            style={{ marginTop: 40 }}
          />
        ) : (
          <View key={fadeKey} style={styles.body}>
            <View style={styles.hero}>
              <View style={styles.heroRow}>
                <View style={styles.heroBlock}>
                  <Text style={styles.heroLabel}>Income</Text>
                  <Text style={[styles.heroValue, styles.income]}>
                    {formatMoney(summary.income, currency)}
                  </Text>
                </View>
                <View style={styles.heroBlock}>
                  <Text style={styles.heroLabel}>Expenses</Text>
                  <Text style={styles.heroValue}>
                    {formatMoney(summary.expenses, currency)}
                  </Text>
                </View>
              </View>
              <View style={styles.netRow}>
                <Text style={styles.heroLabel}>Net</Text>
                <Text
                  style={[
                    styles.netValue,
                    summary.net >= 0 ? styles.income : styles.expense,
                  ]}
                >
                  {formatMoney(summary.net, currency)}
                </Text>
              </View>
              {summary.budgetUsedPercent != null ? (
                <View style={styles.budgetTrack}>
                  <View style={styles.budgetMeta}>
                    <Text style={styles.heroLabel}>Budget used</Text>
                    <Text style={styles.budgetPct}>
                      {summary.budgetUsedPercent}%
                    </Text>
                  </View>
                  <View style={styles.track}>
                    <View
                      style={[
                        styles.trackFill,
                        {
                          width: `${Math.min(summary.budgetUsedPercent, 100)}%`,
                          backgroundColor:
                            summary.budgetUsedPercent > 100
                              ? colors.danger
                              : colors.sageBright,
                        },
                      ]}
                    />
                  </View>
                </View>
              ) : null}
            </View>

            <Text style={styles.section}>Spending by category</Text>
            {summary.byCategory.filter((c) => c.amount > 0).length === 0 ? (
              <Text style={styles.empty}>No expenses this month yet.</Text>
            ) : (
              <View style={styles.bars}>
                {summary.byCategory
                  .filter((c) => c.amount > 0)
                  .map((c, i) => (
                    <View key={c.category} style={styles.barRow}>
                      <View style={styles.barHead}>
                        <Text style={styles.catName}>
                          {i < 3 ? `${i + 1}. ` : ""}
                          {c.category}
                        </Text>
                        <Text style={styles.catAmt}>
                          {formatMoney(c.amount, currency)} · {c.percent}%
                        </Text>
                      </View>
                      <View style={styles.track}>
                        <View
                          style={[
                            styles.trackFill,
                            {
                              width: `${
                                maxCategory > 0
                                  ? Math.round((c.amount / maxCategory) * 100)
                                  : 0
                              }%`,
                              opacity: i < 3 ? 1 : 0.65,
                            },
                          ]}
                        />
                      </View>
                    </View>
                  ))}
              </View>
            )}

            <Text style={styles.section}>Insights</Text>
            <View style={styles.insights}>
              {summary.insights.map((tip, i) => (
                <View key={`${i}-${tip.slice(0, 24)}`} style={styles.insight}>
                  <View style={styles.insightDot} />
                  <Text style={styles.insightText}>{tip}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.ink },
    content: { padding: 20, paddingBottom: 48 },
    back: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 16,
    },
    backText: {
      fontFamily: "DMSans_500Medium",
      color: c.mist,
      fontSize: 15,
    },
    title: {
      fontFamily: "Fraunces_600SemiBold",
      fontSize: 28,
      color: c.mist,
      marginBottom: 12,
    },
    exportBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: c.sageBright,
      borderRadius: 12,
      paddingVertical: 12,
      marginBottom: 18,
    },
    exportText: {
      color: c.ink,
      fontFamily: "DMSans_700Bold",
      fontSize: 14,
    },
    monthNav: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 24,
    },
    monthBtn: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: c.inkCard,
      alignItems: "center",
      justifyContent: "center",
    },
    monthBtnDisabled: { opacity: 0.4 },
    monthLabel: {
      fontFamily: "DMSans_700Bold",
      fontSize: 16,
      color: c.sageBright,
    },
    body: { gap: 8 },
    hero: {
      backgroundColor: c.inkSoft,
      borderRadius: 16,
      padding: 20,
      borderWidth: 1,
      borderColor: c.line,
      marginBottom: 8,
    },
    heroRow: { flexDirection: "row", gap: 16, marginBottom: 16 },
    heroBlock: { flex: 1 },
    heroLabel: {
      fontFamily: "DMSans_400Regular",
      fontSize: 12,
      color: c.mistMuted,
      marginBottom: 4,
      textTransform: "uppercase",
      letterSpacing: 0.6,
    },
    heroValue: {
      fontFamily: "Fraunces_600SemiBold",
      fontSize: 22,
      color: c.mist,
    },
    income: { color: c.income },
    expense: { color: c.danger },
    netRow: {
      flexDirection: "row",
      alignItems: "baseline",
      justifyContent: "space-between",
      marginBottom: 16,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: c.line,
    },
    netValue: {
      fontFamily: "Fraunces_600SemiBold",
      fontSize: 26,
      color: c.mist,
    },
    budgetTrack: { gap: 8 },
    budgetMeta: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    budgetPct: {
      fontFamily: "DMSans_700Bold",
      fontSize: 14,
      color: c.sageBright,
    },
    track: {
      height: 8,
      borderRadius: 4,
      backgroundColor: c.trackBg,
      overflow: "hidden",
    },
    trackFill: {
      height: "100%",
      borderRadius: 4,
      backgroundColor: c.sageBright,
    },
    section: {
      fontFamily: "DMSans_700Bold",
      fontSize: 14,
      color: c.mist,
      marginTop: 20,
      marginBottom: 12,
      textTransform: "uppercase",
      letterSpacing: 0.8,
    },
    empty: {
      fontFamily: "DMSans_400Regular",
      color: c.mistMuted,
      fontSize: 14,
    },
    bars: { gap: 14 },
    barRow: { gap: 6 },
    barHead: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "baseline",
      gap: 8,
    },
    catName: {
      fontFamily: "DMSans_500Medium",
      fontSize: 14,
      color: c.mist,
      flexShrink: 1,
    },
    catAmt: {
      fontFamily: "DMSans_400Regular",
      fontSize: 12,
      color: c.mistMuted,
    },
    insights: { gap: 10 },
    insight: {
      flexDirection: "row",
      gap: 12,
      backgroundColor: c.inkCard,
      borderRadius: 12,
      padding: 14,
      borderWidth: 1,
      borderColor: c.line,
    },
    insightDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: c.sageBright,
      marginTop: 5,
    },
    insightText: {
      flex: 1,
      fontFamily: "DMSans_400Regular",
      fontSize: 14,
      lineHeight: 20,
      color: c.mist,
    },
  });
}
