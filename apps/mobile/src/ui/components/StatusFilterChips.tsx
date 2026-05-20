import { Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { colors, radius, spacing, typography } from "../theme";
import { t } from "../i18n";
import type { DisplayTaskStatus } from "../../utils/status";

export type StatusFilterValue = "all" | DisplayTaskStatus;

const FILTERS: { value: StatusFilterValue; label: string }[] = [
  { value: "all", label: t.filter.all },
  { value: "running", label: t.filter.running },
  { value: "waiting_approval", label: t.filter.waitingApproval },
  { value: "completed", label: t.filter.done },
  { value: "failed", label: t.filter.failed },
  { value: "cancelled", label: t.filter.cancelled },
  { value: "rejected", label: t.filter.rejected }
];

interface StatusFilterChipsProps {
  value: StatusFilterValue;
  onChange: (next: StatusFilterValue) => void;
}

export function StatusFilterChips({ value, onChange }: StatusFilterChipsProps) {
  return (
    <ScrollView
      contentContainerStyle={styles.row}
      horizontal
      showsHorizontalScrollIndicator={false}
    >
      {FILTERS.map((filter) => {
        const active = filter.value === value;
        return (
          <Pressable
            accessibilityRole="button"
            key={filter.value}
            onPress={() => onChange(filter.value)}
            style={({ pressed }) => [
              styles.chip,
              active && styles.chipActive,
              pressed && styles.pressed
            ]}
          >
            <Text style={[styles.text, active && styles.textActive]}>{filter.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  chip: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2
  },
  chipActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primarySoft
  },
  pressed: {
    opacity: 0.7
  },
  row: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs
  },
  text: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: "600"
  },
  textActive: {
    color: colors.primary
  }
});
