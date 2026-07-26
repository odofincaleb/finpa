import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useTheme } from "../context/ThemeContext";
import type { ThemeColors } from "../theme/colors";
import type { Transaction, TransactionType } from "../types";

type Props = {
  visible: boolean;
  item: Transaction | null;
  expenseCategories: string[];
  busy?: boolean;
  onClose: () => void;
  onSave: (patch: {
    amount: number;
    type: TransactionType;
    category: string;
    merchant: string;
    payment_method: string;
    notes: string;
    created_at: string;
  }) => void;
  onDelete: () => void;
};

function toDateInput(iso: string) {
  try {
    return iso.slice(0, 10);
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export function TransactionEditModal({
  visible,
  item,
  expenseCategories,
  busy,
  onClose,
  onSave,
  onDelete,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [type, setType] = useState<TransactionType>("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Other");
  const [merchant, setMerchant] = useState("");
  const [payment, setPayment] = useState("");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState("");

  useEffect(() => {
    if (!item) return;
    setType(item.type);
    setAmount(String(item.amount));
    setCategory(item.type === "income" ? "Income" : String(item.category));
    setMerchant(item.merchant || "");
    setPayment(item.payment_method || "");
    setNotes(item.notes || "");
    setDate(toDateInput(item.created_at));
  }, [item]);

  const categories = type === "income" ? ["Income"] : expenseCategories;

  const save = () => {
    const value = Number(amount.replace(/,/g, ""));
    if (!Number.isFinite(value) || value <= 0) return;
    const created_at = date
      ? new Date(`${date}T12:00:00`).toISOString()
      : item?.created_at || new Date().toISOString();
    onSave({
      amount: value,
      type,
      category: type === "income" ? "Income" : category,
      merchant: merchant.trim() || (type === "income" ? "Income" : category),
      payment_method: payment.trim(),
      notes: notes.trim(),
      created_at,
    });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Edit entry</Text>
          {item?.syncStatus === "pending" ? (
            <Text style={styles.pending}>Pending sync</Text>
          ) : null}

          <ScrollView keyboardShouldPersistTaps="handled">
            <View style={styles.typeRow}>
              <Pressable
                style={[styles.typeBtn, type === "expense" && styles.typeActive]}
                onPress={() => {
                  setType("expense");
                  setCategory(
                    expenseCategories.includes("Other")
                      ? "Other"
                      : expenseCategories[0] || "Other",
                  );
                }}
              >
                <Text style={styles.typeText}>Expense</Text>
              </Pressable>
              <Pressable
                style={[styles.typeBtn, type === "income" && styles.typeActive]}
                onPress={() => {
                  setType("income");
                  setCategory("Income");
                }}
              >
                <Text style={styles.typeText}>Income</Text>
              </Pressable>
            </View>

            <Text style={styles.label}>Amount</Text>
            <TextInput
              style={styles.input}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholderTextColor={colors.mistMuted}
            />

            <Text style={styles.label}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.chipRow}>
                {categories.map((c) => (
                  <Pressable
                    key={c}
                    style={[styles.chip, category === c && styles.chipActive]}
                    onPress={() => setCategory(c)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        category === c && styles.chipTextActive,
                      ]}
                    >
                      {c}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            <Text style={styles.label}>Merchant</Text>
            <TextInput
              style={styles.input}
              value={merchant}
              onChangeText={setMerchant}
              placeholderTextColor={colors.mistMuted}
            />

            <Text style={styles.label}>Payment method</Text>
            <TextInput
              style={styles.input}
              value={payment}
              onChangeText={setPayment}
              placeholderTextColor={colors.mistMuted}
            />

            <Text style={styles.label}>Date (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.input}
              value={date}
              onChangeText={setDate}
              placeholder="2026-07-26"
              placeholderTextColor={colors.mistMuted}
              autoCapitalize="none"
            />

            <Text style={styles.label}>Notes</Text>
            <TextInput
              style={[styles.input, styles.notes]}
              value={notes}
              onChangeText={setNotes}
              multiline
              placeholderTextColor={colors.mistMuted}
            />
          </ScrollView>

          <View style={styles.actions}>
            <Pressable style={styles.deleteBtn} onPress={onDelete} disabled={busy}>
              <Text style={styles.deleteText}>Delete</Text>
            </Pressable>
            <Pressable style={styles.cancelBtn} onPress={onClose} disabled={busy}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable style={styles.saveBtn} onPress={save} disabled={busy}>
              {busy ? (
                <ActivityIndicator color={colors.ink} />
              ) : (
                <Text style={styles.saveText}>Save</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.55)",
      justifyContent: "flex-end",
    },
    sheet: {
      maxHeight: "88%",
      backgroundColor: c.inkSoft,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 20,
      paddingBottom: 28,
      borderWidth: 1,
      borderColor: c.line,
    },
    title: {
      color: c.mist,
      fontFamily: "Fraunces_600SemiBold",
      fontSize: 24,
      marginBottom: 4,
    },
    pending: {
      color: c.sage,
      fontFamily: "DMSans_400Regular",
      fontSize: 12,
      marginBottom: 10,
    },
    typeRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
    typeBtn: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 12,
      alignItems: "center",
      backgroundColor: c.inkCard,
      borderWidth: 1,
      borderColor: c.line,
    },
    typeActive: {
      backgroundColor: c.chipActiveBg,
      borderColor: c.sage,
    },
    typeText: {
      color: c.mist,
      fontFamily: "DMSans_500Medium",
      fontSize: 14,
    },
    label: {
      marginTop: 10,
      marginBottom: 6,
      color: c.mistMuted,
      fontFamily: "DMSans_400Regular",
      fontSize: 12,
    },
    input: {
      backgroundColor: c.inkCard,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.line,
      color: c.mist,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontFamily: "DMSans_400Regular",
      fontSize: 15,
    },
    notes: { minHeight: 64, textAlignVertical: "top" },
    chipRow: { flexDirection: "row", gap: 8, paddingBottom: 4 },
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: c.inkCard,
      borderWidth: 1,
      borderColor: c.line,
    },
    chipActive: { backgroundColor: c.chipActiveBg, borderColor: c.sage },
    chipText: {
      color: c.mistMuted,
      fontFamily: "DMSans_400Regular",
      fontSize: 13,
    },
    chipTextActive: { color: c.mist, fontFamily: "DMSans_500Medium" },
    actions: {
      flexDirection: "row",
      gap: 8,
      marginTop: 16,
      alignItems: "center",
    },
    deleteBtn: { paddingVertical: 12, paddingHorizontal: 8 },
    deleteText: {
      color: c.danger,
      fontFamily: "DMSans_500Medium",
      fontSize: 14,
    },
    cancelBtn: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: "center",
      backgroundColor: c.inkCard,
    },
    cancelText: {
      color: c.mistMuted,
      fontFamily: "DMSans_500Medium",
    },
    saveBtn: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: "center",
      backgroundColor: c.sageBright,
    },
    saveText: {
      color: c.ink,
      fontFamily: "DMSans_700Bold",
      fontSize: 15,
    },
  });
}
