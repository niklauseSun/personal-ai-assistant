import { StyleSheet } from "react-native";

export const colors = {
  background: "#f5f7fb",
  border: "#d7dde8",
  danger: "#b42318",
  muted: "#5f6b7a",
  primary: "#25636f",
  surface: "#ffffff",
  text: "#1f2937"
};

export const sharedStyles = StyleSheet.create({
  button: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 8,
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 10
  },
  buttonDanger: {
    backgroundColor: colors.danger
  },
  buttonGhost: {
    backgroundColor: "#eef3f6"
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700"
  },
  buttonTextGhost: {
    color: colors.primary
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    padding: 14
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    color: colors.text,
    fontSize: 15,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  label: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0,
    textTransform: "uppercase"
  },
  muted: {
    color: colors.muted
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "700",
    lineHeight: 28
  }
});
