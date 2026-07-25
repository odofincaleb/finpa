import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useTheme } from "../context/ThemeContext";
import type { ThemeColors } from "../theme/colors";
import type { TransactionType } from "../types";

type Props = {
  currency: string;
  expenseCategories: string[];
  submitting?: boolean;
  onSubmit: (input: {
    amount: number;
    type: TransactionType;
    category: string;
    merchant: string;
    payment_method: string;
    notes: string;
  }) => void;
};

export function ManualEntryForm({
  currency,
  expenseCategories,
  submitting,
  onSubmit,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [type, setType] = useState<TransactionType>("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Other");
  const [merchant, setMerchant] = useState("");
  const [payment, setPayment] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (type === "expense" && !expenseCategories.includes(category)) {
      setCategory(expenseCategories.includes("Other") ? "Other" : expenseCategories[0] || "Other");
    }
  }, [expenseCategories, category, type]);

  const categories = type === "income" ? ["Income"] : expenseCategories;

  const submit = () => {
    const value = Number(amount.replace(/,/g, ""));
    if (!Number.isFinite(value) || value <= 0) return;
    const cat = type === "income" ? "Income" : category;
    onSubmit({
      amount: value,
      type,
      category: cat,
      merchant: merchant.trim() || (type === "income" ? "Income" : cat),
      payment_method: payment.trim(),
      notes: notes.trim(),
    });
    setAmount("");
    setMerchant("");
    setPayment("");
    setNotes("");
  };

  return (
    <View style={styles.wrap}>
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
          <Text style={[styles.typeText, type === "expense" && styles.typeTextActive]}>
            Expense
          </Text>
        </Pressable>
        <Pressable
          style={[styles.typeBtn, type === "income" && styles.typeActiveIncome]}
          onPress={() => {
            setType("income");
            setCategory("Income");
          }}
        >
          <Text style={[styles.typeText, type === "income" && styles.typeTextActive]}>
            Income
          </Text>
        </Pressable>
      </View>

      <Text style={styles.label}>Amount ({currency})</Text>
      <TextInput
        style={styles.input}
        keyboardType="decimal-pad"
        placeholder="0"
        placeholderTextColor={colors.mistMuted}
        value={amount}
        onChangeText={setAmount}
      />

      {type === "expense" ? (
        <>
          <Text style={styles.label}>Category</Text>
          <View style={styles.chips}>
            {categories.map((c) => (
              <Pressable
                key={c}
                style={[styles.chip, category === c && styles.chipActive]}
                onPress={() => setCategory(c)}
              >
                <Text style={[styles.chipText, category === c && styles.chipTextActive]}>
                  {c}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      <Text style={styles.label}>{type === "income" ? "Source" : "Merchant"}</Text>
      <TextInput
        style={styles.input}
        placeholder={type === "income" ? "Salary, freelance…" : "Shell, Shoprite…"}
        placeholderTextColor={colors.mistMuted}
        value={merchant}
        onChangeText={setMerchant}
      />

      <Text style={styles.label}>Payment method</Text>
      <TextInput
        style={styles.input}
        placeholder="Transfer, cash, card…"
        placeholderTextColor={colors.mistMuted}
        value={payment}
        onChangeText={setPayment}
      />

      <Text style={styles.label}>Notes</Text>
      <TextInput
        style={[styles.input, styles.notes]}
        placeholder="Optional"
        placeholderTextColor={colors.mistMuted}
        value={notes}
        onChangeText={setNotes}
        multiline
      />

      <Pressable
        style={[styles.submit, (!amount || submitting) && styles.submitDisabled]}
        onPress={submit}
        disabled={!amount || submitting}
      >
        {submitting ? (
          <ActivityIndicator color={colors.ink} />
        ) : (
          <Text style={styles.submitText}>
            {type === "income" ? "Add income" : "Add expense"}
          </Text>
        )}
      </Pressable>
    </View>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      backgroundColor: c.inkCard,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.line,
      padding: 14,
      gap: 8,
    },
    typeRow: { flexDirection: "row", gap: 8, marginBottom: 4 },
    typeBtn: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 12,
      alignItems: "center",
      backgroundColor: c.iconBtnBg,
    },
    typeActive: { backgroundColor: c.chipActiveBg },
    typeActiveIncome: { backgroundColor: c.modeActive },
    typeText: {
      color: c.mistMuted,
      fontFamily: "DMSans_500Medium",
      fontSize: 14,
    },
    typeTextActive: { color: c.mist },
    label: {
      marginTop: 4,
      color: c.sage,
      fontFamily: "DMSans_500Medium",
      fontSize: 12,
      textTransform: "uppercase",
      letterSpacing: 0.4,
    },
    input: {
      backgroundColor: c.inkSoft,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.line,
      color: c.mist,
      paddingHorizontal: 12,
      paddingVertical: 12,
      fontFamily: "DMSans_400Regular",
      fontSize: 15,
    },
    notes: { minHeight: 64, textAlignVertical: "top" },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    chip: {
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: 999,
      backgroundColor: c.iconBtnBg,
      borderWidth: 1,
      borderColor: c.line,
    },
    chipActive: {
      borderColor: c.sage,
      backgroundColor: c.chipActiveBg,
    },
    chipText: {
      color: c.mistMuted,
      fontFamily: "DMSans_400Regular",
      fontSize: 12,
    },
    chipTextActive: { color: c.mist },
    submit: {
      marginTop: 8,
      backgroundColor: c.sageBright,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: "center",
    },
    submitDisabled: { opacity: 0.45 },
    submitText: {
      color: c.ink,
      fontFamily: "DMSans_700Bold",
      fontSize: 15,
    },
  });
}
