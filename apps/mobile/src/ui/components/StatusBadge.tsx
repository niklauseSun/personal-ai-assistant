import { StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../theme";
import { t } from "../i18n";
import type { DisplayTaskStatus } from "../../utils/status";

interface StatusBadgeProps {
  status: DisplayTaskStatus;
}

interface BadgeStyle {
  bg: string;
  text: string;
  label: string;
}

function styleForStatus(status: DisplayTaskStatus): BadgeStyle {
  switch (status) {
    case "running":
      return { bg: colors.statusRunningSoft, text: colors.statusRunning, label: t.status.running };
    case "completed":
      return { bg: colors.statusDoneSoft, text: colors.statusDone, label: t.status.done };
    case "failed":
      return { bg: colors.statusFailedSoft, text: colors.statusFailed, label: t.status.failed };
    case "waiting_approval":
      return { bg: colors.statusPendingSoft, text: colors.statusPending, label: t.status.waitingApproval };
    case "cancelled":
      return { bg: colors.statusNeutralSoft, text: colors.statusNeutral, label: t.status.cancelled };
    case "rejected":
      return { bg: colors.statusFailedSoft, text: colors.statusFailed, label: t.status.rejected };
    case "created":
    default:
      return { bg: colors.statusNeutralSoft, text: colors.statusNeutral, label: t.status.created };
  }
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const variant = styleForStatus(status);
  return (
    <View style={[styles.badge, { backgroundColor: variant.bg }]}>
      <Text style={[styles.text, { color: variant.text }]}>{variant.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 4
  },
  text: {
    ...typography.captionStrong,
    color: colors.text
  }
});
