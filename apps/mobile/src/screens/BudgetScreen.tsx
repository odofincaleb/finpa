import React, { useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useNavigation } from "@react-navigation/native";
import { ArrowLeft, Plus } from "lucide-react-native";
import { BudgetActualTable } from "../components/BudgetActualTable";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useBudgets } from "../hooks/useBudgets";
import { formatMoney } from "../lib/currency";
import type { ThemeColors } from "../theme/colors";

export function BudgetScreen() {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { profile } = useAuth();
  const now = new Date();
  const currency = profile?.preferred_currency ?? "NGN";
  const budgets = useBudgets();
  const [newCategory, setNewCategory] = useState("");
  const [catError, setCatError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const monthLabel = now.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  const addCategory = async () => {
    setCatError(null);
    setAdding(true);
    try {
      const result = await budgets.addCategory(newCategory);
      if (!result.ok) {
        setCatError(result.error || "Could not add category");
        return;
      }
      setNewCategory("");
    } finally {
      setAdding(false);
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

        <Text style={styles.title}>Budget & actuals</Text>
        <Text style={styles.sub}>{monthLabel}</Text>

        <View style={styles.summary}>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Spent</Text>
            <Text style={styles.statValue}>
              {formatMoney(budgets.totalActual, currency)}
            </Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Budget</Text>
            <Text style={styles.statValue}>
              {formatMoney(budgets.totalBudget, currency)}
            </Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Left</Text>
            <Text style={styles.statValue}>
              {formatMoney(Math.max(budgets.remaining, 0), currency)}
            </Text>
          </View>
        </View>

        {budgets.incomeTotal > 0 ? (
          <Text style={styles.income}>
            Income this month: {formatMoney(budgets.incomeTotal, currency)}
          </Text>
        ) : null}

        <Text style={styles.hint}>
          Tap a Budget cell to set amounts. New categories also appear in Manual mode on Home.
        </Text>

        <View style={styles.addRow}>
          <TextInput
            style={styles.addInput}
            placeholder="New category (e.g. School fees)"
            placeholderTextColor={colors.mistMuted}
            value={newCategory}
            onChangeText={setNewCategory}
            onSubmitEditing={addCategory}
          />
          <Pressable
            style={[styles.addBtn, (!newCategory.trim() || adding) && styles.addDisabled]}
            onPress={addCategory}
            disabled={!newCategory.trim() || adding}
          >
            <Plus size={20} color={colors.ink} />
          </Pressable>
        </View>
        {catError ? <Text style={styles.catError}>{catError}</Text> : null}

        <BudgetActualTable
          rows={budgets.rows}
          currency={currency}
          loading={budgets.loading}
          onSaveBudget={async (category, amount) => {
            await budgets.upsertBudget(category, amount);
          }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.ink },
    content: { padding: 20, paddingBottom: 40 },
    back: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12 },
    backText: { color: c.mistMuted, fontFamily: "DMSans_400Regular", fontSize: 14 },
    title: {
      color: c.mist,
      fontFamily: "Fraunces_600SemiBold",
      fontSize: 32,
    },
    sub: {
      marginTop: 4,
      color: c.sageBright,
      fontFamily: "DMSans_500Medium",
      fontSize: 14,
    },
    summary: {
      marginTop: 20,
      flexDirection: "row",
      gap: 10,
    },
    stat: {
      flex: 1,
      backgroundColor: c.inkCard,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.line,
      padding: 12,
    },
    statLabel: {
      color: c.mistMuted,
      fontFamily: "DMSans_400Regular",
      fontSize: 11,
      textTransform: "uppercase",
    },
    statValue: {
      marginTop: 6,
      color: c.mist,
      fontFamily: "DMSans_700Bold",
      fontSize: 14,
    },
    income: {
      marginTop: 14,
      color: c.income,
      fontFamily: "DMSans_500Medium",
      fontSize: 14,
    },
    hint: {
      marginTop: 14,
      marginBottom: 10,
      color: c.mistMuted,
      fontFamily: "DMSans_400Regular",
      fontSize: 13,
      lineHeight: 19,
    },
    addRow: {
      flexDirection: "row",
      gap: 8,
      marginBottom: 8,
    },
    addInput: {
      flex: 1,
      backgroundColor: c.inkCard,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.line,
      color: c.mist,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontFamily: "DMSans_400Regular",
      fontSize: 15,
    },
    addBtn: {
      width: 48,
      borderRadius: 12,
      backgroundColor: c.sageBright,
      alignItems: "center",
      justifyContent: "center",
    },
    addDisabled: { opacity: 0.4 },
    catError: {
      color: c.danger,
      fontFamily: "DMSans_400Regular",
      fontSize: 13,
      marginBottom: 8,
    },
  });
}
