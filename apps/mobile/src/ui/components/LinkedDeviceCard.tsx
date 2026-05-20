import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, shadows, spacing, typography } from "../theme";
import { MonitorIcon, SyncIcon } from "../icons";
import { t, format } from "../i18n";

interface LinkedDeviceCardProps {
  bound: boolean;
  deviceName?: string;
  online?: boolean;
  mobileLabel?: string;
  onPress?: () => void;
  onSyncPress?: () => void;
  onBindPress?: () => void;
}

export function LinkedDeviceCard({
  bound,
  deviceName,
  online = false,
  mobileLabel,
  onPress,
  onSyncPress,
  onBindPress
}: LinkedDeviceCardProps) {
  if (!bound) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onBindPress}
        style={({ pressed }) => [styles.card, styles.unboundCard, pressed && styles.pressed]}
      >
        <View style={styles.iconWrap}>
          <MonitorIcon size={22} color={colors.textMuted} />
        </View>
        <View style={styles.body}>
          <Text style={styles.title}>{t.device.unboundTitle}</Text>
          <Text style={styles.subtitle}>{t.device.unboundHint}</Text>
        </View>
        <Text style={styles.cta}>{t.device.bindCta}</Text>
      </Pressable>
    );
  }

  const resolvedName = deviceName?.trim() || t.device.desktopFallback;
  const dotColor = online ? colors.online : colors.offline;
  const subline = format(t.device.connectedSubline, {
    name: mobileLabel || t.device.linked
  });

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.iconWrap}>
        <MonitorIcon size={22} color={colors.primary} />
      </View>
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text numberOfLines={1} style={styles.deviceName}>
            {resolvedName}
          </Text>
          <View style={[styles.dot, { backgroundColor: dotColor }]} />
          <Text style={[styles.dotLabel, online ? styles.online : styles.offline]}>
            {online ? t.device.online : t.device.offline}
          </Text>
        </View>
        <Text numberOfLines={1} style={styles.subline}>
          {subline}
        </Text>
      </View>
      <Pressable
        accessibilityLabel="同步"
        accessibilityRole="button"
        hitSlop={10}
        onPress={onSyncPress}
        style={styles.syncBtn}
      >
        <SyncIcon size={20} color={colors.textMuted} />
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    gap: 2
  },
  card: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.lg,
    ...shadows.card
  },
  cta: {
    ...typography.bodyStrong,
    color: colors.primary
  },
  deviceName: {
    ...typography.bodyStrong,
    color: colors.text,
    flexShrink: 1
  },
  dot: {
    borderRadius: radius.pill,
    height: 8,
    marginLeft: spacing.sm,
    width: 8
  },
  dotLabel: {
    ...typography.caption,
    fontWeight: "600",
    marginLeft: 4
  },
  iconWrap: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    height: 40,
    justifyContent: "center",
    width: 40
  },
  offline: {
    color: colors.textSubtle
  },
  online: {
    color: colors.online
  },
  pressed: {
    opacity: 0.85
  },
  subline: {
    ...typography.caption,
    color: colors.textMuted
  },
  subtitle: {
    ...typography.caption,
    color: colors.textMuted
  },
  syncBtn: {
    alignItems: "center",
    height: 36,
    justifyContent: "center",
    width: 36
  },
  title: {
    ...typography.bodyStrong
  },
  titleRow: {
    alignItems: "center",
    flexDirection: "row"
  },
  unboundCard: {
    backgroundColor: colors.surface
  }
});
