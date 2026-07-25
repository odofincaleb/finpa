import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import * as Clipboard from "expo-clipboard";
import { ArrowLeft, Copy, Search, Share2, Trash2, X } from "lucide-react-native";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import {
  type AdminPin,
  fetchAdminPins,
  generateAdminPins,
  revokeAdminPin,
  updateAdminPin,
} from "../lib/api";
import { sharePins } from "../lib/sharePin";
import type { ThemeColors } from "../theme/colors";

type Filter = "unused" | "redeemed" | "all";
type Period = "monthly" | "annual";
type PeriodFilter = Period | "all";

export function AdminPinsScreen() {
  const navigation = useNavigation();
  const { token, isSuperAdmin } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [filter, setFilter] = useState<Filter>("unused");
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [pins, setPins] = useState<AdminPin[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>("monthly");
  const [count, setCount] = useState("5");
  const [notes, setNotes] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState("");
  const [lastCreated, setLastCreated] = useState<AdminPin[]>([]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const { pins: rows } = await fetchAdminPins(token, {
        status: filter,
        period: periodFilter,
        q: debouncedSearch,
        limit: 100,
      });
      setPins(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load pins");
    } finally {
      setLoading(false);
    }
  }, [token, filter, periodFilter, debouncedSearch]);

  useEffect(() => {
    if (!isSuperAdmin) {
      navigation.goBack();
      return;
    }
    void load();
  }, [isSuperAdmin, load, navigation]);

  const generate = async () => {
    if (!token) return;
    const n = Number(count);
    if (!Number.isFinite(n) || n < 1 || n > 50) {
      setError("Count must be between 1 and 50");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { pins: created } = await generateAdminPins(
        token,
        period,
        Math.floor(n),
        notes.trim(),
      );
      setLastCreated(created);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generate failed");
    } finally {
      setBusy(false);
    }
  };

  const copyCode = async (code: string) => {
    try {
      await Clipboard.setStringAsync(code);
      Alert.alert("Copied", code);
    } catch {
      Alert.alert("Copy failed", code);
    }
  };

  const onShare = async (rows: AdminPin[]) => {
    try {
      await sharePins(rows);
    } catch {
      // user dismissed sheet
    }
  };

  const onDelete = (pin: AdminPin) => {
    if (pin.redeemed_by) return;
    Alert.alert("Delete PIN?", `Remove ${pin.code}? This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          if (!token) return;
          setBusy(true);
          try {
            await revokeAdminPin(token, pin.code);
            await load();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Delete failed");
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  const startEdit = (pin: AdminPin) => {
    if (pin.redeemed_by) return;
    setEditing(pin.code);
    setEditNotes(pin.notes || "");
  };

  const saveEdit = async () => {
    if (!token || !editing) return;
    setBusy(true);
    setError(null);
    try {
      await updateAdminPin(token, editing, { notes: editNotes.trim() });
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <StatusBar style={colors.statusBar} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => navigation.goBack()} style={styles.back}>
          <ArrowLeft size={20} color={colors.mist} />
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <Text style={styles.title}>Manage PINs</Text>
        <Text style={styles.lead}>
          Create, edit, share, or revoke activation codes. Share opens WhatsApp, SMS, and other apps.
        </Text>

        <Text style={styles.section}>Create</Text>
        <View style={styles.card}>
          <View style={styles.periodRow}>
            {(["monthly", "annual"] as Period[]).map((p) => (
              <Pressable
                key={p}
                style={[styles.chip, period === p && styles.chipActive]}
                onPress={() => setPeriod(p)}
              >
                <Text style={[styles.chipText, period === p && styles.chipTextActive]}>
                  {p === "monthly" ? "Monthly" : "Annual"}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.label}>Count</Text>
          <TextInput
            style={styles.input}
            keyboardType="number-pad"
            value={count}
            onChangeText={setCount}
            placeholder="5"
            placeholderTextColor={colors.mistMuted}
          />
          <Text style={styles.label}>Notes (optional)</Text>
          <TextInput
            style={styles.input}
            value={notes}
            onChangeText={setNotes}
            placeholder="e.g. Batch for March sales"
            placeholderTextColor={colors.mistMuted}
          />
          <Pressable style={styles.cta} onPress={generate} disabled={busy}>
            {busy ? (
              <ActivityIndicator color={colors.ink} />
            ) : (
              <Text style={styles.ctaText}>Generate</Text>
            )}
          </Pressable>
        </View>

        {lastCreated.length ? (
          <View style={styles.card}>
            <Text style={styles.subTitle}>Just created ({lastCreated.length})</Text>
            {lastCreated.map((p) => (
              <Text key={p.code} style={styles.codeLine}>
                {p.code}
              </Text>
            ))}
            <View style={styles.actionRow}>
              <Pressable
                style={styles.actionBtn}
                onPress={() => onShare(lastCreated)}
              >
                <Share2 size={16} color={colors.mist} />
                <Text style={styles.actionText}>Share all</Text>
              </Pressable>
              <Pressable
                style={styles.actionBtn}
                onPress={() =>
                  copyCode(lastCreated.map((p) => p.code).join("\n"))
                }
              >
                <Copy size={16} color={colors.mist} />
                <Text style={styles.actionText}>Copy all</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        <Text style={styles.section}>Inventory</Text>
        <View style={styles.searchWrap}>
          <Search size={18} color={colors.mistMuted} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search code or notes…"
            placeholderTextColor={colors.mistMuted}
            autoCapitalize="characters"
            autoCorrect={false}
            clearButtonMode="never"
          />
          {search ? (
            <Pressable onPress={() => setSearch("")} hitSlop={8}>
              <X size={18} color={colors.mistMuted} />
            </Pressable>
          ) : null}
        </View>

        <Text style={styles.filterLabel}>Status</Text>
        <View style={styles.periodRow}>
          {(["unused", "redeemed", "all"] as Filter[]).map((f) => (
            <Pressable
              key={f}
              style={[styles.chip, filter === f && styles.chipActive]}
              onPress={() => setFilter(f)}
            >
              <Text style={[styles.chipText, filter === f && styles.chipTextActive]}>
                {f === "unused" ? "Unused" : f === "redeemed" ? "Redeemed" : "All"}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.filterLabel}>Plan</Text>
        <View style={styles.periodRow}>
          {(["all", "monthly", "annual"] as PeriodFilter[]).map((p) => (
            <Pressable
              key={p}
              style={[styles.chip, periodFilter === p && styles.chipActive]}
              onPress={() => setPeriodFilter(p)}
            >
              <Text
                style={[
                  styles.chipText,
                  periodFilter === p && styles.chipTextActive,
                ]}
              >
                {p === "all" ? "All plans" : p === "monthly" ? "Monthly" : "Annual"}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.resultCount}>
          {loading ? "Searching…" : `${pins.length} pin${pins.length === 1 ? "" : "s"}`}
          {debouncedSearch ? ` matching “${debouncedSearch}”` : ""}
        </Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {loading ? (
          <ActivityIndicator color={colors.sageBright} style={{ marginTop: 24 }} />
        ) : pins.length === 0 ? (
          <Text style={styles.empty}>
            No pins match this search and filters.
          </Text>
        ) : (
          pins.map((pin) => {
            const used = Boolean(pin.redeemed_by);
            return (
              <View key={pin.code} style={styles.card}>
                <Text style={styles.codeLine}>{pin.code}</Text>
                <Text style={styles.meta}>
                  {pin.period} · {pin.duration_days}d ·{" "}
                  {used ? "Redeemed" : "Unused"}
                </Text>
                {pin.notes ? (
                  <Text style={styles.meta}>Note: {pin.notes}</Text>
                ) : null}

                {editing === pin.code ? (
                  <View style={{ marginTop: 10, gap: 8 }}>
                    <TextInput
                      style={styles.input}
                      value={editNotes}
                      onChangeText={setEditNotes}
                      placeholder="Notes"
                      placeholderTextColor={colors.mistMuted}
                    />
                    <View style={styles.actionRow}>
                      <Pressable style={styles.actionBtn} onPress={saveEdit}>
                        <Text style={styles.actionText}>Save</Text>
                      </Pressable>
                      <Pressable
                        style={styles.actionBtn}
                        onPress={() => setEditing(null)}
                      >
                        <Text style={styles.actionText}>Cancel</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <View style={styles.actionRow}>
                    <Pressable
                      style={styles.actionBtn}
                      onPress={() => copyCode(pin.code)}
                    >
                      <Copy size={16} color={colors.mist} />
                      <Text style={styles.actionText}>Copy</Text>
                    </Pressable>
                    <Pressable
                      style={styles.actionBtn}
                      onPress={() => onShare([pin])}
                    >
                      <Share2 size={16} color={colors.mist} />
                      <Text style={styles.actionText}>Share</Text>
                    </Pressable>
                    {!used ? (
                      <>
                        <Pressable
                          style={styles.actionBtn}
                          onPress={() => startEdit(pin)}
                        >
                          <Text style={styles.actionText}>Edit</Text>
                        </Pressable>
                        <Pressable
                          style={styles.actionBtn}
                          onPress={() => onDelete(pin)}
                        >
                          <Trash2 size={16} color={colors.danger} />
                          <Text style={[styles.actionText, { color: colors.danger }]}>
                            Delete
                          </Text>
                        </Pressable>
                      </>
                    ) : null}
                  </View>
                )}
              </View>
            );
          })
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
      marginBottom: 12,
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
    },
    lead: {
      marginTop: 8,
      marginBottom: 20,
      fontFamily: "DMSans_400Regular",
      fontSize: 14,
      lineHeight: 20,
      color: c.mistMuted,
    },
    section: {
      fontFamily: "DMSans_700Bold",
      fontSize: 12,
      color: c.sageBright,
      textTransform: "uppercase",
      letterSpacing: 0.8,
      marginBottom: 10,
      marginTop: 8,
    },
    card: {
      backgroundColor: c.inkCard,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.line,
      padding: 14,
      marginBottom: 12,
      gap: 6,
    },
    searchWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: c.inkCard,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.line,
      paddingHorizontal: 12,
      marginBottom: 12,
    },
    searchInput: {
      flex: 1,
      color: c.mist,
      fontFamily: "DMSans_400Regular",
      fontSize: 15,
      paddingVertical: 12,
    },
    filterLabel: {
      fontFamily: "DMSans_500Medium",
      fontSize: 11,
      color: c.mistMuted,
      textTransform: "uppercase",
      letterSpacing: 0.6,
      marginBottom: 6,
    },
    resultCount: {
      fontFamily: "DMSans_400Regular",
      fontSize: 12,
      color: c.mistMuted,
      marginBottom: 10,
      marginTop: 2,
    },
    periodRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: c.iconBtnBg,
      borderWidth: 1,
      borderColor: c.line,
    },
    chipActive: {
      backgroundColor: c.chipActiveBg,
      borderColor: c.sage,
    },
    chipText: {
      fontFamily: "DMSans_500Medium",
      fontSize: 13,
      color: c.mistMuted,
    },
    chipTextActive: { color: c.mist },
    label: {
      fontFamily: "DMSans_500Medium",
      fontSize: 12,
      color: c.mistMuted,
      marginTop: 6,
    },
    input: {
      backgroundColor: c.inkSoft,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.line,
      color: c.mist,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontFamily: "DMSans_400Regular",
      fontSize: 15,
    },
    cta: {
      marginTop: 12,
      backgroundColor: c.sageBright,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: "center",
    },
    ctaText: {
      fontFamily: "DMSans_700Bold",
      color: c.ink,
      fontSize: 15,
    },
    subTitle: {
      fontFamily: "DMSans_700Bold",
      color: c.mist,
      fontSize: 14,
      marginBottom: 4,
    },
    codeLine: {
      fontFamily: "DMSans_700Bold",
      color: c.mist,
      fontSize: 15,
      letterSpacing: 0.5,
    },
    meta: {
      fontFamily: "DMSans_400Regular",
      color: c.mistMuted,
      fontSize: 12,
    },
    actionRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 10,
    },
    actionBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 10,
      backgroundColor: c.iconBtnBg,
    },
    actionText: {
      fontFamily: "DMSans_500Medium",
      color: c.mist,
      fontSize: 13,
    },
    error: {
      color: c.danger,
      fontFamily: "DMSans_400Regular",
      marginBottom: 10,
    },
    empty: {
      color: c.mistMuted,
      fontFamily: "DMSans_400Regular",
      marginTop: 12,
    },
  });
}
