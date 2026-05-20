import type { MobileBoundDesktop } from "@personal-ai-assistant/shared";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { IconButton } from "../ui/components";
import { CloseIcon, MonitorIcon, ScanIcon, TrashIcon } from "../ui/icons";
import { colors, radius, shadows, spacing, typography } from "../ui/theme";
import { t } from "../ui/i18n";

export interface DesktopPresence {
  status: "online" | "offline";
  lastSeenAt: string;
}

interface BoundDesktopDrawerProps {
  activeDesktopId?: string;
  desktops: MobileBoundDesktop[];
  desktopPresenceById: Record<string, DesktopPresence>;
  isOpen: boolean;
  onClose: () => void;
  onDelete: (desktopId: string) => void;
  onScan: () => void;
  onSelect: (desktop: MobileBoundDesktop) => void;
}

export function BoundDesktopDrawer({
  activeDesktopId,
  desktops,
  desktopPresenceById,
  isOpen,
  onClose,
  onDelete,
  onScan,
  onSelect
}: BoundDesktopDrawerProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <View style={styles.backdrop}>
      <Pressable accessibilityRole="button" onPress={onClose} style={styles.scrim} />
      <View style={styles.drawer}>
        <View style={styles.handle} />
        <View style={styles.headerRow}>
          <Text style={styles.title}>{t.drawer.title}</Text>
          <IconButton accessibilityLabel={t.drawer.close} onPress={onClose}>
            <CloseIcon size={22} color={colors.text} />
          </IconButton>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={onScan}
          style={({ pressed }) => [styles.scanCta, pressed && styles.pressed]}
        >
          <ScanIcon size={20} color="#ffffff" />
          <Text style={styles.scanCtaText}>{t.drawer.scanCta}</Text>
        </Pressable>

        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        >
          {desktops.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>{t.drawer.empty}</Text>
            </View>
          ) : (
            desktops.map((desktop) => {
              const isActive = desktop.id === activeDesktopId;
              const presence = desktopPresenceById[desktop.desktopId];
              const isOnline = presence?.status === "online";

              return (
                <View
                  key={desktop.id}
                  style={[styles.deviceCard, isActive && styles.deviceCardActive]}
                >
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => onSelect(desktop)}
                    style={styles.deviceInfo}
                  >
                    <View style={styles.iconWrap}>
                      <MonitorIcon size={20} color={isActive ? colors.primary : colors.textMuted} />
                    </View>
                    <View style={styles.deviceText}>
                      <View style={styles.deviceNameRow}>
                        <Text numberOfLines={1} style={styles.deviceName}>
                          {desktop.desktopName}
                        </Text>
                        <View style={[styles.dot, { backgroundColor: isOnline ? colors.online : colors.offline }]} />
                        <Text style={[styles.presence, isOnline ? styles.online : styles.offline]}>
                          {isOnline ? t.device.online : t.device.offline}
                        </Text>
                      </View>
                      <Text numberOfLines={1} style={styles.deviceUrl}>
                        {desktop.serverUrl}
                      </Text>
                      {isActive ? (
                        <Text style={styles.activeLabel}>{t.drawer.active}</Text>
                      ) : null}
                    </View>
                  </Pressable>
                  <IconButton
                    accessibilityLabel={t.drawer.delete}
                    onPress={() => onDelete(desktop.id)}
                  >
                    <TrashIcon size={20} color={colors.danger} />
                  </IconButton>
                </View>
              );
            })
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  activeLabel: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: "600"
  },
  backdrop: {
    bottom: 0,
    flexDirection: "row",
    justifyContent: "flex-end",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 10
  },
  deviceCard: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md
  },
  deviceCardActive: {
    borderColor: colors.primary,
    borderWidth: 2
  },
  deviceInfo: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: spacing.md
  },
  deviceName: {
    ...typography.bodyStrong,
    flexShrink: 1
  },
  deviceNameRow: {
    alignItems: "center",
    flexDirection: "row"
  },
  deviceText: {
    flex: 1,
    gap: 2
  },
  deviceUrl: {
    ...typography.caption,
    color: colors.textMuted
  },
  dot: {
    borderRadius: radius.pill,
    height: 7,
    marginLeft: spacing.sm,
    width: 7
  },
  drawer: {
    backgroundColor: colors.surface,
    borderBottomLeftRadius: radius.xl,
    borderTopLeftRadius: radius.xl,
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    width: "84%",
    ...shadows.card
  },
  emptyState: {
    alignItems: "center",
    padding: spacing.xl
  },
  emptyTitle: {
    ...typography.body,
    color: colors.textMuted
  },
  handle: {
    alignSelf: "center",
    backgroundColor: colors.border,
    borderRadius: radius.pill,
    height: 4,
    marginBottom: spacing.sm,
    width: 40
  },
  headerRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  iconWrap: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    height: 36,
    justifyContent: "center",
    width: 36
  },
  list: {
    gap: spacing.sm,
    paddingBottom: spacing.lg
  },
  offline: {
    color: colors.textSubtle
  },
  online: {
    color: colors.online
  },
  presence: {
    ...typography.caption,
    fontWeight: "600",
    marginLeft: 4
  },
  pressed: {
    opacity: 0.85
  },
  scanCta: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: spacing.lg
  },
  scanCtaText: {
    ...typography.bodyStrong,
    color: "#ffffff"
  },
  scrim: {
    backgroundColor: "rgba(15, 23, 42, 0.36)",
    flex: 1
  },
  title: {
    ...typography.sectionTitle
  }
});
