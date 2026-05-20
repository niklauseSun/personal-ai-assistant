import { StyleSheet } from "react-native";
import { colors as themeColors, radius, spacing, typography } from "./theme";

export { radius, spacing, typography } from "./theme";

export const colors = {
  background: themeColors.bg,
  border: themeColors.border,
  danger: themeColors.danger,
  muted: themeColors.textMuted,
  primary: themeColors.primary,
  surface: themeColors.surface,
  text: themeColors.text
} as const;

export const sharedStyles = StyleSheet.create({
  button: {
    alignItems: "center",
    backgroundColor: themeColors.primary,
    borderRadius: radius.md,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md
  },
  buttonDanger: {
    backgroundColor: themeColors.danger
  },
  buttonGhost: {
    backgroundColor: themeColors.primarySoft
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700"
  },
  buttonTextGhost: {
    color: themeColors.primary
  },
  card: {
    backgroundColor: themeColors.surface,
    borderColor: themeColors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg
  },
  input: {
    backgroundColor: themeColors.surface,
    borderColor: themeColors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    color: themeColors.text,
    fontSize: 15,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md
  },
  label: {
    color: themeColors.textMuted,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.4,
    textTransform: "uppercase"
  },
  muted: {
    ...typography.caption,
    color: themeColors.textMuted
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md
  },
  title: {
    ...typography.title,
    lineHeight: 30
  }
});
