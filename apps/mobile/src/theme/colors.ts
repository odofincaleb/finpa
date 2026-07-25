export type ThemeMode = "light" | "dark";

export type ThemeColors = {
  ink: string;
  inkSoft: string;
  inkCard: string;
  mist: string;
  mistMuted: string;
  sage: string;
  sageBright: string;
  teal: string;
  tealSoft: string;
  danger: string;
  income: string;
  line: string;
  overlay: string;
  /** LinearGradient stops (top → bottom) */
  gradient: [string, string, string];
  statusBar: "light" | "dark";
  iconBtnBg: string;
  modeActive: string;
  warnBg: string;
  warnBorder: string;
  overBg: string;
  overBorder: string;
  trackBg: string;
  chipActiveBg: string;
};

export const darkColors: ThemeColors = {
  ink: "#0B1210",
  inkSoft: "#121A17",
  inkCard: "#18211D",
  mist: "#E8F0EC",
  mistMuted: "#A8B8B0",
  sage: "#7C9A88",
  sageBright: "#9BB8A4",
  teal: "#2F6F5E",
  tealSoft: "#3D8B76",
  danger: "#C45C5C",
  income: "#6BAE8A",
  line: "rgba(232,240,236,0.08)",
  overlay: "rgba(11,18,16,0.72)",
  gradient: ["#0E1A15", "#0B1210", "#0A100E"],
  statusBar: "light",
  iconBtnBg: "rgba(232,240,236,0.06)",
  modeActive: "rgba(155,184,164,0.22)",
  warnBg: "rgba(155,184,164,0.1)",
  warnBorder: "rgba(155,184,164,0.28)",
  overBg: "rgba(196,92,92,0.12)",
  overBorder: "rgba(196,92,92,0.35)",
  trackBg: "rgba(232,240,236,0.08)",
  chipActiveBg: "rgba(155,184,164,0.22)",
};

/** Soft mint-paper light theme — sage accents, dark ink text (not purple/cream defaults). */
export const lightColors: ThemeColors = {
  ink: "#F3F6F4",
  inkSoft: "#E7EEEA",
  inkCard: "#FFFFFF",
  mist: "#0F1A16",
  mistMuted: "#5C6F66",
  sage: "#3F7A62",
  sageBright: "#2F6F5E",
  teal: "#2F6F5E",
  tealSoft: "#3D8B76",
  danger: "#B83C3C",
  income: "#2E8B57",
  line: "rgba(15,26,22,0.1)",
  overlay: "rgba(243,246,244,0.88)",
  gradient: ["#E8F1EC", "#F3F6F4", "#DDE8E2"],
  statusBar: "dark",
  iconBtnBg: "rgba(15,26,22,0.06)",
  modeActive: "rgba(47,111,94,0.16)",
  warnBg: "rgba(47,111,94,0.08)",
  warnBorder: "rgba(47,111,94,0.22)",
  overBg: "rgba(184,60,60,0.1)",
  overBorder: "rgba(184,60,60,0.28)",
  trackBg: "rgba(15,26,22,0.08)",
  chipActiveBg: "rgba(47,111,94,0.14)",
};

/** @deprecated Prefer useTheme().colors — kept as dark default for boot screens */
export const colors = darkColors;
