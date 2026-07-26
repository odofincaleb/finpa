import React, { useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { TransactionCard } from "./TransactionCard";
import { TransactionEditModal } from "./TransactionEditModal";
import { useFinance } from "../context/FinanceContext";
import { useTheme } from "../context/ThemeContext";
import type { ThemeColors } from "../theme/colors";
import type { Transaction } from "../types";

type Props = {
  transactions: Transaction[];
  limit?: number;
  highlightIds?: Set<string>;
  editable?: boolean;
};

function dayLabel(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function TransactionTable({
  transactions,
  limit,
  highlightIds,
  editable = true,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { expenseCategories, updateTransaction, deleteTransaction } = useFinance();
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [busy, setBusy] = useState(false);

  const groups = useMemo(() => {
    const sliced = limit ? transactions.slice(0, limit) : transactions;
    const map = new Map<string, Transaction[]>();
    for (const t of sliced) {
      const key = t.created_at.slice(0, 10);
      const list = map.get(key) ?? [];
      list.push(t);
      map.set(key, list);
    }
    return Array.from(map.entries());
  }, [transactions, limit]);

  const confirmDelete = () => {
    if (!editing) return;
    Alert.alert("Delete entry", "Remove this transaction?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void (async () => {
            setBusy(true);
            try {
              await deleteTransaction(editing.id);
              setEditing(null);
            } finally {
              setBusy(false);
            }
          })();
        },
      },
    ]);
  };

  if (!transactions.length) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>No entries yet</Text>
        <Text style={styles.emptyBody}>
          Tell FINPA what you spent — e.g. “Spent ₦4500 on fuel at Total with transfer”
        </Text>
      </View>
    );
  }

  return (
    <View>
      {groups.map(([day, rows]) => (
        <View key={day} style={styles.group}>
          <Text style={styles.day}>{dayLabel(rows[0].created_at)}</Text>
          {rows.map((item) => {
            const card = (
              <TransactionCard
                item={item}
                animate={highlightIds?.has(item.id)}
              />
            );
            if (!editable) return <View key={item.id}>{card}</View>;
            return (
              <Pressable key={item.id} onPress={() => setEditing(item)}>
                {card}
              </Pressable>
            );
          })}
        </View>
      ))}

      <TransactionEditModal
        visible={Boolean(editing)}
        item={editing}
        expenseCategories={expenseCategories}
        busy={busy}
        onClose={() => setEditing(null)}
        onDelete={confirmDelete}
        onSave={(patch) => {
          if (!editing) return;
          void (async () => {
            setBusy(true);
            try {
              await updateTransaction(editing.id, patch);
              setEditing(null);
            } finally {
              setBusy(false);
            }
          })();
        }}
      />
    </View>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    group: { marginBottom: 8 },
    day: {
      color: c.sage,
      fontFamily: "DMSans_500Medium",
      fontSize: 12,
      letterSpacing: 0.4,
      textTransform: "uppercase",
      marginBottom: 4,
      marginTop: 8,
    },
    empty: {
      paddingVertical: 28,
      paddingHorizontal: 8,
    },
    emptyTitle: {
      color: c.mist,
      fontFamily: "Fraunces_600SemiBold",
      fontSize: 20,
      marginBottom: 8,
    },
    emptyBody: {
      color: c.mistMuted,
      fontFamily: "DMSans_400Regular",
      fontSize: 14,
      lineHeight: 21,
    },
  });
}
