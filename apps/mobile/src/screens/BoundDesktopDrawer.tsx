import type { MobileBoundDesktop } from "@personal-ai-assistant/shared";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, sharedStyles } from "../ui/styles";

interface BoundDesktopDrawerProps {
  activeDesktopId?: string;
  desktops: MobileBoundDesktop[];
  isOpen: boolean;
  onClose: () => void;
  onDelete: (desktopId: string) => void;
  onScan: () => void;
  onSelect: (desktop: MobileBoundDesktop) => void;
}

export function BoundDesktopDrawer({
  activeDesktopId,
  desktops,
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
        <View style={styles.headerRow}>
          <View>
            <Text style={sharedStyles.label}>Desktops</Text>
            <Text style={styles.title}>Bound desktops</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={[sharedStyles.button, sharedStyles.buttonGhost, styles.smallButton]}
          >
            <Text style={[sharedStyles.buttonText, sharedStyles.buttonTextGhost]}>Close</Text>
          </Pressable>
        </View>

        <Pressable accessibilityRole="button" onPress={onScan} style={sharedStyles.button}>
          <Text style={sharedStyles.buttonText}>Scan desktop QR</Text>
        </Pressable>

        <View style={styles.list}>
          {desktops.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No desktop bound</Text>
              <Text style={sharedStyles.muted}>Scan a desktop QR code to add one.</Text>
            </View>
          ) : (
            desktops.map((desktop) => {
              const isActive = desktop.id === activeDesktopId;

              return (
                <View
                  key={desktop.id}
                  style={[sharedStyles.card, styles.desktopCard, isActive && styles.activeCard]}
                >
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => onSelect(desktop)}
                    style={styles.desktopInfo}
                  >
                    <Text style={styles.desktopName}>{desktop.desktopName}</Text>
                    <Text numberOfLines={1} style={sharedStyles.muted}>
                      {desktop.serverUrl}
                    </Text>
                    <Text numberOfLines={1} style={styles.tokenText}>
                      {desktop.deviceId}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => onDelete(desktop.id)}
                    style={[sharedStyles.button, sharedStyles.buttonDanger, styles.smallButton]}
                  >
                    <Text style={sharedStyles.buttonText}>Delete</Text>
                  </Pressable>
                </View>
              );
            })
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  activeCard: {
    borderColor: colors.primary,
    borderWidth: 2
  },
  backdrop: {
    bottom: 0,
    flexDirection: "row",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 10
  },
  desktopCard: {
    gap: 10
  },
  desktopInfo: {
    gap: 5
  },
  desktopName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700"
  },
  drawer: {
    backgroundColor: colors.background,
    borderLeftColor: colors.border,
    borderLeftWidth: 1,
    gap: 14,
    padding: 16,
    width: "84%"
  },
  emptyState: {
    alignItems: "center",
    gap: 8,
    padding: 24
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "700"
  },
  headerRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  list: {
    gap: 10
  },
  scrim: {
    backgroundColor: "rgba(15, 23, 42, 0.36)",
    flex: 1
  },
  smallButton: {
    minHeight: 38,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "700"
  },
  tokenText: {
    color: colors.muted,
    fontSize: 12
  }
});
