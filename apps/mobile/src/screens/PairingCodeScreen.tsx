import type { MobileBoundDesktop } from "@personal-ai-assistant/shared";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { AppHeader, IconButton } from "../ui/components";
import { ChevronLeftIcon } from "../ui/icons";
import { colors, radius, shadows, spacing, typography } from "../ui/theme";
import { t } from "../ui/i18n";
import { sharedStyles } from "../ui/styles";

interface PairingCodeScreenProps {
  code: string;
  connectionStatus: string;
  desktop?: MobileBoundDesktop;
  error?: string;
  isSubmitting: boolean;
  onBack: () => void;
  onCodeChange: (value: string) => void;
  onSubmit: () => void;
}

export function PairingCodeScreen({
  code,
  connectionStatus,
  desktop,
  error,
  isSubmitting,
  onBack,
  onCodeChange,
  onSubmit
}: PairingCodeScreenProps) {
  const canSubmit = code.length === 6 && !isSubmitting;

  return (
    <View style={styles.container}>
      <AppHeader
        title={t.pairing.title}
        subtitle={t.pairing.subtitle}
        actions={
          <IconButton accessibilityLabel={t.pairing.back} onPress={onBack}>
            <ChevronLeftIcon size={22} color={colors.text} />
          </IconButton>
        }
      />

      <View style={styles.body}>
        <View style={styles.card}>
          <Text style={styles.desktopName}>
            {desktop?.desktopName ?? t.device.desktopFallback}
          </Text>
          <Text style={styles.helper} numberOfLines={1}>
            {desktop?.serverUrl ?? ""}
          </Text>
          <Text style={styles.helper}>{connectionStatus}</Text>
        </View>

        <View style={styles.codeBlock}>
          <Text style={styles.label}>{t.pairing.placeholder}</Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="number-pad"
            maxLength={6}
            onChangeText={onCodeChange}
            placeholder="000000"
            placeholderTextColor={colors.textSubtle}
            style={[styles.codeInput, error ? styles.codeInputError : null]}
            value={code}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={!canSubmit}
          onPress={onSubmit}
          style={[sharedStyles.button, !canSubmit && styles.disabled]}
        >
          <Text style={sharedStyles.buttonText}>
            {isSubmitting ? t.pairing.submitting : t.pairing.submit}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: spacing.lg,
    paddingHorizontal: spacing.lg
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    gap: spacing.xs,
    padding: spacing.lg,
    ...shadows.card
  },
  codeBlock: {
    gap: spacing.sm
  },
  codeInput: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    color: colors.text,
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: 6,
    paddingVertical: spacing.md,
    textAlign: "center"
  },
  codeInputError: {
    borderColor: colors.danger
  },
  container: {
    flex: 1,
    gap: spacing.md
  },
  desktopName: {
    ...typography.bodyStrong
  },
  disabled: {
    opacity: 0.5
  },
  error: {
    ...typography.caption,
    color: colors.danger,
    fontWeight: "600"
  },
  helper: {
    ...typography.caption,
    color: colors.textMuted
  },
  label: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: "600"
  }
});
