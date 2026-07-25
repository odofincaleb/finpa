import React, { useCallback, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import {
  BookOpen,
  LayoutDashboard,
  Lightbulb,
  PieChart,
  Settings,
} from "lucide-react-native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useNavigation } from "@react-navigation/native";
import { BrandMark } from "../components/BrandMark";
import { ChatInputBar } from "../components/ChatInputBar";
import { ManualEntryForm } from "../components/ManualEntryForm";
import { SpendingAlertCards } from "../components/SpendingAlertCards";
import { TransactionTable } from "../components/TransactionTable";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useBudgets } from "../hooks/useBudgets";
import { useChatExpense } from "../hooks/useChatExpense";
import { useTransactions } from "../hooks/useTransactions";
import { formatMoney } from "../lib/currency";
import { computeSpendingAlerts } from "../lib/spendingAlerts";
import type { ThemeColors } from "../theme/colors";
import type { RootStackParamList } from "../navigation/types";
import type { Transaction, TransactionType } from "../types";

type EntryMode = "chat" | "ask" | "manual";

export function HomeScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { profile } = useAuth();
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const currency = profile?.preferred_currency ?? "NGN";

  const { transactions, addTransactions } = useTransactions();
  const budgets = useBudgets(year, month);
  const [highlightIds, setHighlightIds] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<EntryMode>("chat");
  const [manualBusy, setManualBusy] = useState(false);
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(
    () => new Set(),
  );

  const onCreated = useCallback(
    (rows: Transaction[]) => {
      addTransactions(rows);
      setHighlightIds(new Set(rows.map((r) => r.id)));
    },
    [addTransactions],
  );

  const askContext = useMemo(
    () => ({
      currency,
      incomeTotal: budgets.incomeTotal,
      totalBudget: budgets.totalBudget,
      totalActual: budgets.totalActual,
      remaining: budgets.remaining,
      budgetRows: budgets.rows,
      expenseCategories: budgets.expenseCategories,
    }),
    [
      currency,
      budgets.incomeTotal,
      budgets.totalBudget,
      budgets.totalActual,
      budgets.remaining,
      budgets.rows,
      budgets.expenseCategories,
    ],
  );

  const { send, sending, feed } = useChatExpense(
    onCreated,
    budgets.expenseCategories,
    transactions,
    askContext,
  );

  const alerts = useMemo(() => {
    const all = computeSpendingAlerts(budgets.rows, currency);
    return all.filter((a) => !dismissedAlerts.has(a.id));
  }, [budgets.rows, currency, dismissedAlerts]);

  const expiresLabel = useMemo(() => {
    if (!profile?.subscription_expires_at) return null;
    const d = new Date(profile.subscription_expires_at);
    return d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
  }, [profile?.subscription_expires_at]);

  const submitManual = async (input: {
    amount: number;
    type: TransactionType;
    category: string;
    merchant: string;
    payment_method: string;
    notes: string;
  }) => {
    setManualBusy(true);
    try {
      const message =
        input.type === "income"
          ? `Received ${input.amount} income from ${input.merchant}${
              input.payment_method ? ` via ${input.payment_method}` : ""
            }${input.notes ? `. ${input.notes}` : ""}`
          : `Spent ${input.amount} on ${input.merchant} for ${input.category}${
              input.payment_method ? ` with ${input.payment_method}` : ""
            }${input.notes ? `. ${input.notes}` : ""}`;
      await send(message);
    } finally {
      setManualBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={colors.gradient}
        style={StyleSheet.absoluteFill}
      />
      <StatusBar style={colors.statusBar} />
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.topBar}>
          <View style={styles.brandSlot}>
            <BrandMark size={44} />
          </View>
          <View style={styles.actions}>
            <Pressable
              style={styles.iconBtn}
              onPress={() => navigation.navigate("QuickTips")}
            >
              <Lightbulb size={18} color={colors.mist} />
            </Pressable>
            <Pressable
              style={styles.iconBtn}
              onPress={() => navigation.navigate("Summary")}
            >
              <LayoutDashboard size={18} color={colors.mist} />
            </Pressable>
            <Pressable
              style={styles.iconBtn}
              onPress={() => navigation.navigate("Budget")}
            >
              <PieChart size={18} color={colors.mist} />
            </Pressable>
            <Pressable
              style={styles.iconBtn}
              onPress={() => navigation.navigate("Ledger")}
            >
              <BookOpen size={18} color={colors.mist} />
            </Pressable>
            <Pressable
              style={styles.iconBtn}
              onPress={() => navigation.navigate("Settings")}
            >
              <Settings size={18} color={colors.mist} />
            </Pressable>
          </View>
        </View>

        {expiresLabel ? (
          <Text style={styles.chip}>
            Pro · {profile?.subscription_period} · {expiresLabel}
          </Text>
        ) : null}

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <Pressable
            style={styles.summary}
            onPress={() => navigation.navigate("Budget")}
          >
            <Text style={styles.summaryLabel}>This month · tap for budget</Text>
            <Text style={styles.summaryValue}>
              {formatMoney(budgets.totalActual, currency)}
            </Text>
            <Text style={styles.summaryMeta}>
              {formatMoney(Math.max(budgets.remaining, 0), currency)} left of{" "}
              {formatMoney(budgets.totalBudget, currency)} budget
              {budgets.incomeTotal > 0
                ? ` · Income ${formatMoney(budgets.incomeTotal, currency)}`
                : ""}
            </Text>
          </Pressable>

          <View style={styles.alertsSlot}>
            <SpendingAlertCards
              alerts={alerts}
              onPress={() => navigation.navigate("Budget")}
              onDismiss={(id) =>
                setDismissedAlerts((prev) => new Set(prev).add(id))
              }
            />
          </View>

          <View style={styles.modeRow}>
            <Pressable
              style={[styles.modeBtn, mode === "chat" && styles.modeActive]}
              onPress={() => setMode("chat")}
            >
              <Text style={[styles.modeText, mode === "chat" && styles.modeTextActive]}>
                Chat
              </Text>
            </Pressable>
            <Pressable
              style={[styles.modeBtn, mode === "ask" && styles.modeActive]}
              onPress={() => setMode("ask")}
            >
              <Text style={[styles.modeText, mode === "ask" && styles.modeTextActive]}>
                Ask
              </Text>
            </Pressable>
            <Pressable
              style={[styles.modeBtn, mode === "manual" && styles.modeActive]}
              onPress={() => setMode("manual")}
            >
              <Text style={[styles.modeText, mode === "manual" && styles.modeTextActive]}>
                Manual
              </Text>
            </Pressable>
          </View>

          {mode === "manual" ? (
            <View style={styles.entryBlock}>
              <ManualEntryForm
                currency={currency}
                expenseCategories={budgets.expenseCategories}
                submitting={manualBusy || sending}
                onSubmit={submitManual}
              />
            </View>
          ) : (
            <View style={styles.entryBlock}>
              {feed.length ? (
                <View style={styles.feed}>
                  {feed.slice(-3).map((item) => (
                    <Text
                      key={item.id}
                      style={[
                        styles.feedText,
                        item.role === "user" && styles.feedUser,
                      ]}
                      numberOfLines={3}
                    >
                      {item.role === "user" ? "You · " : "FINPA · "}
                      {item.text}
                    </Text>
                  ))}
                </View>
              ) : (
                <Pressable onPress={() => navigation.navigate("QuickTips")}>
                  <Text style={styles.entryHint}>
                    {mode === "ask"
                      ? "Try: “Can I afford ₦80,000 shoes?” · Quick tips →"
                      : "Try: “Spent 4500 on fuel” · Quick tips →"}
                  </Text>
                </Pressable>
              )}
              <ChatInputBar
                onSend={(msg) =>
                  void send(msg, { askOnly: mode === "ask" })
                }
                sending={sending}
                embedded
              />
            </View>
          )}

          <View style={styles.recentHeader}>
            <Text style={styles.section}>Recent</Text>
            <Pressable onPress={() => navigation.navigate("Ledger")}>
              <Text style={styles.seeAll}>Full ledger</Text>
            </Pressable>
          </View>
          <TransactionTable
            transactions={transactions}
            limit={12}
            highlightIds={highlightIds}
          />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.ink },
    safe: { flex: 1 },
    topBar: {
      paddingHorizontal: 16,
      paddingTop: 4,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
    },
    brandSlot: {
      flexShrink: 1,
    },
    actions: {
      flexDirection: "row",
      flexShrink: 0,
      gap: 4,
    },
    iconBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.iconBtnBg,
    },
    chip: {
      marginTop: 10,
      marginHorizontal: 20,
      alignSelf: "flex-start",
      color: c.sage,
      fontFamily: "DMSans_500Medium",
      fontSize: 12,
    },
    scroll: { flex: 1 },
    scrollContent: {
      paddingHorizontal: 20,
      paddingBottom: 28,
    },
    summary: {
      marginTop: 18,
    },
    summaryLabel: {
      color: c.mistMuted,
      fontFamily: "DMSans_400Regular",
      fontSize: 13,
    },
    summaryValue: {
      marginTop: 4,
      color: c.mist,
      fontFamily: "Fraunces_600SemiBold",
      fontSize: 36,
    },
    summaryMeta: {
      marginTop: 6,
      color: c.mistMuted,
      fontFamily: "DMSans_400Regular",
      fontSize: 13,
      lineHeight: 19,
    },
    alertsSlot: {
      marginTop: 16,
    },
    modeRow: {
      marginTop: 20,
      flexDirection: "row",
      gap: 8,
      backgroundColor: c.inkCard,
      borderRadius: 14,
      padding: 4,
      borderWidth: 1,
      borderColor: c.line,
    },
    modeBtn: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 11,
      alignItems: "center",
    },
    modeActive: {
      backgroundColor: c.modeActive,
    },
    modeText: {
      color: c.mistMuted,
      fontFamily: "DMSans_500Medium",
      fontSize: 14,
    },
    modeTextActive: {
      color: c.mist,
    },
    entryBlock: {
      marginTop: 14,
    },
    entryHint: {
      color: c.mistMuted,
      fontFamily: "DMSans_400Regular",
      fontSize: 13,
      marginBottom: 8,
      lineHeight: 19,
    },
    feed: {
      marginBottom: 8,
      gap: 4,
    },
    feedText: {
      color: c.sageBright,
      fontFamily: "DMSans_400Regular",
      fontSize: 12,
    },
    feedUser: {
      color: c.mistMuted,
    },
    recentHeader: {
      marginTop: 28,
      marginBottom: 4,
      flexDirection: "row",
      alignItems: "flex-end",
      justifyContent: "space-between",
    },
    section: {
      color: c.mist,
      fontFamily: "Fraunces_600SemiBold",
      fontSize: 22,
    },
    seeAll: {
      color: c.sageBright,
      fontFamily: "DMSans_500Medium",
      fontSize: 13,
      marginBottom: 2,
    },
  });
}
