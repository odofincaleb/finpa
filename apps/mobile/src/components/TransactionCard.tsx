import React, { useEffect, useMemo, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../context/ThemeContext";
import type { ThemeColors } from "../theme/colors";
import { formatMoney } from "../lib/currency";
import type { Transaction } from "../types";

type Props = {
  item: Transaction;
  animate?: boolean;
};

export function TransactionCard({ item, animate }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const opacity = useRef(new Animated.Value(animate ? 0 : 1)).current;
  const translate = useRef(new Animated.Value(animate ? 10 : 0)).current;

  useEffect(() => {
    if (!animate) return;
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 320, useNativeDriver: true }),
      Animated.timing(translate, { toValue: 0, duration: 320, useNativeDriver: true }),
    ]).start();
  }, [animate, opacity, translate]);

  const isIncome = item.type === "income";

  return (
    <Animated.View style={[styles.row, { opacity, transform: [{ translateY: translate }] }]}>
      <View style={styles.left}>
        <Text style={styles.merchant} numberOfLines={1}>
          {item.merchant || item.category}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {item.category}
          {item.payment_method ? ` · ${item.payment_method}` : ""}
          {item.syncStatus === "pending" || item.id.startsWith("local-")
            ? " · Pending sync"
            : ""}
        </Text>
      </View>
      <Text style={[styles.amount, isIncome && styles.income]}>
        {isIncome ? "+" : "-"}
        {formatMoney(Number(item.amount), item.currency)}
      </Text>
    </Animated.View>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.line,
    },
    left: { flex: 1, paddingRight: 12 },
    merchant: {
      color: c.mist,
      fontFamily: "DMSans_500Medium",
      fontSize: 15,
    },
    meta: {
      marginTop: 2,
      color: c.mistMuted,
      fontFamily: "DMSans_400Regular",
      fontSize: 12,
    },
    amount: {
      color: c.mist,
      fontFamily: "DMSans_700Bold",
      fontSize: 15,
    },
    income: {
      color: c.income,
    },
  });
}
