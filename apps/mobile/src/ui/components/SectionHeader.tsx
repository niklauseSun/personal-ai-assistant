import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, spacing, typography } from "../theme";

interface SectionHeaderProps {
  title: string;
  actionLabel?: string;
  actionIcon?: ReactNode;
  onActionPress?: () => void;
}

export function SectionHeader({ title, actionLabel, actionIcon, onActionPress }: SectionHeaderProps) {
  return (
    <View style={styles.row}>
      <Text style={styles.title}>{title}</Text>
      {(actionLabel || actionIcon) && onActionPress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          hitSlop={8}
          onPress={onActionPress}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
        >
          {actionIcon}
          {actionLabel ? <Text style={styles.actionLabel}>{actionLabel}</Text> : null}
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  action: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs
  },
  actionLabel: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: "600"
  },
  pressed: {
    opacity: 0.6
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  title: {
    ...typography.sectionTitle
  }
});
