import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { SpendingAlert } from "../lib/spendingAlerts";
import { useTheme } from "../context/ThemeContext";
import type { ThemeColors } from "../theme/colors";

type Props = {
  alerts: SpendingAlert[];
  onPress?: () => void;
  onDismiss?: (id: string) => void;
};

export function SpendingAlertCards({ alerts, onPress, onDismiss }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (!alerts.length) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Spending alerts</Text>
      {alerts.slice(0, 4).map((a) => (
        <Pressable
          key={a.id}
          style={[styles.card, a.level === "over" ? styles.over : styles.warn]}
          onPress={onPress}
        >
          <View style={styles.row}>
            <View
              style={[
                styles.dot,
                {
                  backgroundColor:
                    a.level === "over" ? colors.danger : colors.sageBright,
                },
              ]}
            />
            <Text style={styles.text}>{a.message}</Text>
            {onDismiss ? (
              <Pressable
                onPress={() => onDismiss(a.id)}
                hitSlop={10}
                style={styles.dismiss}
              >
                <Text style={styles.dismissText}>✕</Text>
              </Pressable>
            ) : null}
          </View>
        </Pressable>
      ))}
    </View>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    wrap: { gap: 8, marginBottom: 4 },
    label: {
      fontFamily: "DMSans_700Bold",
      fontSize: 11,
      color: c.mistMuted,
      textTransform: "uppercase",
      letterSpacing: 0.8,
    },
    card: {
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderWidth: 1,
    },
    warn: {
      backgroundColor: c.warnBg,
      borderColor: c.warnBorder,
    },
    over: {
      backgroundColor: c.overBg,
      borderColor: c.overBorder,
    },
    row: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
    dot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
    text: {
      flex: 1,
      fontFamily: "DMSans_400Regular",
      fontSize: 13,
      lineHeight: 19,
      color: c.mist,
    },
    dismiss: { paddingLeft: 4 },
    dismissText: {
      fontFamily: "DMSans_500Medium",
      fontSize: 14,
      color: c.mistMuted,
    },
  });
}
