import { Platform, type TextStyle, type ViewStyle } from "react-native";

export const colors = {
  bg: "#f5f7fb",
  surface: "#ffffff",
  surfaceMuted: "#f1f3f9",
  border: "#e6e8f0",
  borderStrong: "#d2d6e2",
  text: "#111827",
  textMuted: "#6b7280",
  textSubtle: "#9ca3af",
  primary: "#6554e8",
  primarySoft: "#eef0ff",
  primaryStrong: "#4f3fd4",
  online: "#22c55e",
  onlineSoft: "#dcfce7",
  offline: "#9ca3af",
  offlineSoft: "#e5e7eb",
  statusRunning: "#2563eb",
  statusRunningSoft: "#dbeafe",
  statusDone: "#16a34a",
  statusDoneSoft: "#dcfce7",
  statusFailed: "#dc2626",
  statusFailedSoft: "#fee2e2",
  statusPending: "#b45309",
  statusPendingSoft: "#fef3c7",
  statusNeutral: "#4b5563",
  statusNeutralSoft: "#e5e7eb",
  danger: "#ef4444",
  dangerSoft: "#fee2e2",
  terminalBg: "#0f172a",
  terminalText: "#e2e8f0"
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28
} as const;

const monoFamily = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

export const typography = {
  title: { fontSize: 24, fontWeight: "700" as TextStyle["fontWeight"], color: colors.text },
  sectionTitle: { fontSize: 18, fontWeight: "700" as TextStyle["fontWeight"], color: colors.text },
  body: { fontSize: 15, fontWeight: "400" as TextStyle["fontWeight"], color: colors.text },
  bodyStrong: { fontSize: 15, fontWeight: "600" as TextStyle["fontWeight"], color: colors.text },
  caption: { fontSize: 13, fontWeight: "400" as TextStyle["fontWeight"], color: colors.textMuted },
  captionStrong: { fontSize: 13, fontWeight: "600" as TextStyle["fontWeight"], color: colors.textMuted },
  micro: { fontSize: 11, fontWeight: "600" as TextStyle["fontWeight"], color: colors.textMuted, letterSpacing: 0.4 },
  mono: { fontFamily: monoFamily, fontSize: 14, color: colors.text }
} as const;

export const shadows = {
  card: Platform.select<ViewStyle>({
    ios: {
      shadowColor: "#0f172a",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.06,
      shadowRadius: 16
    },
    android: { elevation: 2 },
    default: {}
  }) as ViewStyle,
  fab: Platform.select<ViewStyle>({
    ios: {
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.3,
      shadowRadius: 16
    },
    android: { elevation: 6 },
    default: {}
  }) as ViewStyle
} as const;

export const theme = { colors, radius, spacing, typography, shadows } as const;

export type ThemeColor = keyof typeof colors;
