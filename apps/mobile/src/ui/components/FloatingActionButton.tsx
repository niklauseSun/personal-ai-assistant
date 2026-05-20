import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, shadows, spacing, typography } from "../theme";
import { PlusIcon } from "../icons";

interface FloatingActionButtonProps {
  onPress: () => void;
  label?: string;
  accessibilityLabel: string;
}

export function FloatingActionButton({ onPress, label, accessibilityLabel }: FloatingActionButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [styles.fab, pressed && styles.pressed]}
    >
      <View style={styles.row}>
        <PlusIcon size={22} color="#ffffff" />
        {label ? <Text style={styles.label}>{label}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    bottom: 24,
    flexDirection: "row",
    justifyContent: "center",
    minHeight: 56,
    paddingHorizontal: spacing.lg,
    position: "absolute",
    right: 20,
    ...shadows.fab
  },
  label: {
    ...typography.bodyStrong,
    color: "#ffffff"
  },
  pressed: {
    opacity: 0.85
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm
  }
});
