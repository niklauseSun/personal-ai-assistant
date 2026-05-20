import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, shadows, spacing, typography } from "../theme";
import { TerminalIcon } from "../icons";
import { StatusBadge } from "./StatusBadge";
import type { DisplayTaskStatus } from "../../utils/status";

interface CommandCardProps {
  title: string;
  description?: string;
  timeLabel: string;
  durationLabel?: string;
  status: DisplayTaskStatus;
  onPress?: () => void;
}

export function CommandCard({
  title,
  description,
  timeLabel,
  durationLabel,
  status,
  onPress
}: CommandCardProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.headerRow}>
        <View style={styles.iconWrap}>
          <TerminalIcon size={20} color={colors.primary} />
        </View>
        <View style={styles.headerBody}>
          <Text numberOfLines={1} style={styles.title}>
            {title}
          </Text>
          {description ? (
            <Text numberOfLines={2} style={styles.description}>
              {description}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={styles.footer}>
        <Text style={styles.time}>{timeLabel}</Text>
        <View style={styles.footerRight}>
          {durationLabel ? <Text style={styles.duration}>{durationLabel}</Text> : null}
          <StatusBadge status={status} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    gap: spacing.md,
    padding: spacing.lg,
    ...shadows.card
  },
  description: {
    ...typography.caption,
    color: colors.textMuted
  },
  duration: {
    ...typography.caption,
    color: colors.textMuted
  },
  footer: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  footerRight: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm
  },
  headerBody: {
    flex: 1,
    gap: 2
  },
  headerRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md
  },
  iconWrap: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    height: 36,
    justifyContent: "center",
    width: 36
  },
  pressed: {
    opacity: 0.9
  },
  time: {
    ...typography.caption,
    color: colors.textMuted
  },
  title: {
    ...typography.mono,
    color: colors.text,
    fontSize: 14,
    fontWeight: "600"
  }
});
