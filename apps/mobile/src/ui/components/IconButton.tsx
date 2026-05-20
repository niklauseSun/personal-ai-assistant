import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { colors, radius } from "../theme";

interface IconButtonProps {
  onPress?: () => void;
  accessibilityLabel: string;
  disabled?: boolean;
  size?: number;
  variant?: "ghost" | "soft" | "filled";
  children: ReactNode;
}

export function IconButton({
  onPress,
  accessibilityLabel,
  disabled,
  size = 40,
  variant = "ghost",
  children
}: IconButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled || !onPress}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        { width: size, height: size, borderRadius: radius.pill },
        variant === "soft" && styles.soft,
        variant === "filled" && styles.filled,
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled
      ]}
    >
      <View style={styles.content}>{children}</View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    justifyContent: "center"
  },
  content: {
    alignItems: "center",
    justifyContent: "center"
  },
  disabled: {
    opacity: 0.4
  },
  filled: {
    backgroundColor: colors.primary
  },
  pressed: {
    opacity: 0.6
  },
  soft: {
    backgroundColor: colors.primarySoft
  }
});
