import React, { useMemo } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useNavigation } from "@react-navigation/native";
import { ArrowLeft } from "lucide-react-native";
import { TransactionTable } from "../components/TransactionTable";
import { useTheme } from "../context/ThemeContext";
import { useTransactions } from "../hooks/useTransactions";
import type { ThemeColors } from "../theme/colors";

export function LedgerScreen() {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { transactions, loading } = useTransactions();

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <StatusBar style={colors.statusBar} />
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={() => navigation.goBack()} style={styles.back}>
          <ArrowLeft size={20} color={colors.mist} />
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <Text style={styles.title}>Ledger</Text>
        <Text style={styles.sub}>Full history from chat and manual entries</Text>
        {loading && !transactions.length ? (
          <ActivityIndicator color={colors.sage} style={{ marginTop: 40 }} />
        ) : (
          <TransactionTable transactions={transactions} />
        )}
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
      marginTop: 6,
      marginBottom: 16,
      color: c.mistMuted,
      fontFamily: "DMSans_400Regular",
    },
  });
}
