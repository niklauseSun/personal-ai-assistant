import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, spacing, typography } from "../theme";

interface AppHeaderProps {
  title: string;
  subtitle?: string;
  leading?: ReactNode;
  actions?: ReactNode;
}

export function AppHeader({ title, subtitle, leading, actions }: AppHeaderProps) {
  return (
    <View style={styles.row}>
      <View style={styles.titleBlock}>
        {leading ? <View style={styles.leading}>{leading}</View> : null}
        <View style={{ flexShrink: 1 }}>
          <Text numberOfLines={1} style={styles.title}>
            {title}
          </Text>
          {subtitle ? (
            <Text numberOfLines={1} style={styles.subtitle}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  actions: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs
  },
  leading: {
    marginRight: spacing.md
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md
  },
  subtitle: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2
  },
  title: {
    ...typography.title
  },
  titleBlock: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 1
  }
});
