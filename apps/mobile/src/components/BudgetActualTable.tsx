import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  LayoutAnimation,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { ChevronDown, ChevronUp } from "lucide-react-native";
import { useTheme } from "../context/ThemeContext";
import type { ThemeColors } from "../theme/colors";
import { formatMoney } from "../lib/currency";
import type { BudgetActualRow } from "../types";

type Props = {
  rows: BudgetActualRow[];
  currency: string;
  loading?: boolean;
  onSaveBudget: (category: string, amount: number) => Promise<void>;
};

export function BudgetActualTable({ rows, currency, loading, onSaveBudget }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [expanded, setExpanded] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const visible = expanded ? rows : rows.slice(0, 3);
  const totalBudget = rows.reduce((s, r) => s + Number(r.budget_amount), 0);
  const totalActual = rows.reduce((s, r) => s + Number(r.actual_amount), 0);

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((v) => !v);
  };

  const startEdit = (row: BudgetActualRow) => {
    setEditing(row.category);
    setDraft(String(row.budget_amount || ""));
  };

  const commit = async (category: string) => {
    const amount = Number(draft);
    if (!Number.isFinite(amount) || amount < 0) {
      setEditing(null);
      return;
    }
    setSaving(true);
    try {
      await onSaveBudget(category, amount);
      setEditing(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <Pressable onPress={toggle} style={styles.header}>
        <View>
          <Text style={styles.title}>Monthly budget</Text>
          <Text style={styles.sub}>
            Actual {formatMoney(totalActual, currency)} · Budget{" "}
            {formatMoney(totalBudget, currency)}
          </Text>
        </View>
        {expanded ? (
          <ChevronUp size={20} color={colors.sageBright} />
        ) : (
          <ChevronDown size={20} color={colors.sageBright} />
        )}
      </Pressable>

      <View style={styles.tableHead}>
        <Text style={[styles.colCat, styles.head]}>Category</Text>
        <Text style={[styles.colNum, styles.head]}>Budget</Text>
        <Text style={[styles.colNum, styles.head]}>Actual</Text>
        <Text style={[styles.colNum, styles.head]}>Left</Text>
      </View>

      {loading && !rows.length ? (
        <ActivityIndicator color={colors.sage} style={{ marginVertical: 16 }} />
      ) : (
        visible.map((row) => {
          const over = row.remaining < 0;
          return (
            <View key={row.category} style={styles.row}>
              <Text style={styles.colCat} numberOfLines={1}>
                {row.category}
              </Text>
              {editing === row.category ? (
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  keyboardType="numeric"
                  autoFocus
                  style={styles.edit}
                  onBlur={() => commit(row.category)}
                  onSubmitEditing={() => commit(row.category)}
                  editable={!saving}
                />
              ) : (
                <Pressable onPress={() => startEdit(row)} style={styles.colNumPress}>
                  <Text
                    style={[
                      styles.colNum,
                      !row.budget_amount && styles.budgetUnset,
                    ]}
                  >
                    {row.budget_amount
                      ? formatMoney(row.budget_amount, row.currency || currency)
                      : "Set"}
                  </Text>
                </Pressable>
              )}
              <Text style={styles.colNum}>
                {formatMoney(row.actual_amount, row.currency || currency)}
              </Text>
              <Text style={[styles.colNum, over && styles.over]}>
                {formatMoney(row.remaining, row.currency || currency)}
              </Text>
            </View>
          );
        })
      )}

      {!rows.some((r) => r.budget_amount > 0) ? (
        <Text style={styles.emptyHint}>Tap Budget (or “Set”) on a category to enter an amount</Text>
      ) : null}

      {!expanded && rows.length > 3 ? (
        <Pressable onPress={toggle}>
          <Text style={styles.more}>Show all categories</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      marginTop: 16,
      paddingTop: 4,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 12,
    },
    title: {
      color: c.mist,
      fontFamily: "Fraunces_600SemiBold",
      fontSize: 22,
    },
    sub: {
      marginTop: 4,
      color: c.mistMuted,
      fontFamily: "DMSans_400Regular",
      fontSize: 13,
    },
    tableHead: {
      flexDirection: "row",
      paddingBottom: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.line,
    },
    head: {
      color: c.sage,
      fontSize: 11,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.line,
    },
    colCat: {
      flex: 1.3,
      color: c.mist,
      fontFamily: "DMSans_400Regular",
      fontSize: 13,
    },
    colNum: {
      flex: 1,
      textAlign: "right",
      color: c.mist,
      fontFamily: "DMSans_500Medium",
      fontSize: 12,
    },
    colNumPress: { flex: 1 },
    over: { color: c.danger },
    edit: {
      flex: 1,
      textAlign: "right",
      color: c.ink,
      backgroundColor: c.sageBright,
      borderRadius: 8,
      paddingHorizontal: 6,
      paddingVertical: 4,
      fontFamily: "DMSans_500Medium",
      fontSize: 12,
    },
    more: {
      marginTop: 10,
      color: c.sageBright,
      fontFamily: "DMSans_500Medium",
      fontSize: 13,
    },
    budgetUnset: {
      color: c.sageBright,
    },
    emptyHint: {
      marginTop: 12,
      color: c.mistMuted,
      fontFamily: "DMSans_400Regular",
      fontSize: 13,
      lineHeight: 19,
    },
  });
}
