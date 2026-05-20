import { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { AppHeader, FloatingActionButton, IconButton } from "../ui/components";
import { ChevronLeftIcon } from "../ui/icons";
import { colors, radius, spacing, typography } from "../ui/theme";
import { t } from "../ui/i18n";
import { sharedStyles } from "../ui/styles";

export interface DesktopTargetOption {
  desktopId: string;
  label: string;
}

interface CreateTaskScreenProps {
  availableDesktops: DesktopTargetOption[];
  canRun: boolean;
  onBack: () => void;
  onRun: (input: { workspacePath: string; prompt: string; targetDesktopId?: string }) => void;
}

export function CreateTaskScreen({
  availableDesktops,
  canRun,
  onBack,
  onRun
}: CreateTaskScreenProps) {
  const [workspacePath, setWorkspacePath] = useState("");
  const [prompt, setPrompt] = useState("");
  const [selectedDesktopId, setSelectedDesktopId] = useState<string | undefined>();

  useEffect(() => {
    if (availableDesktops.length === 1) {
      setSelectedDesktopId(availableDesktops[0].desktopId);
      return;
    }

    if (
      selectedDesktopId &&
      !availableDesktops.some((desktop) => desktop.desktopId === selectedDesktopId)
    ) {
      setSelectedDesktopId(undefined);
    }
  }, [availableDesktops, selectedDesktopId]);

  const run = () => {
    if (!workspacePath.trim()) {
      Alert.alert(t.create.workspace, t.create.workspacePlaceholder);
      return;
    }

    if (!prompt.trim()) {
      Alert.alert(t.create.prompt, t.create.promptPlaceholder);
      return;
    }

    if (availableDesktops.length > 0 && !selectedDesktopId) {
      Alert.alert(t.create.desktop, t.create.desktopEmpty);
      return;
    }

    onRun({
      workspacePath: workspacePath.trim(),
      prompt: prompt.trim(),
      targetDesktopId: selectedDesktopId
    });
    setPrompt("");
  };

  return (
    <View style={styles.container}>
      <AppHeader
        title={t.create.title}
        subtitle={t.create.subtitle}
        actions={
          <IconButton accessibilityLabel={t.create.back} onPress={onBack}>
            <ChevronLeftIcon size={22} color={colors.text} />
          </IconButton>
        }
      />

      <View style={styles.body}>
        <View style={styles.field}>
          <Text style={styles.label}>{t.create.desktop}</Text>
          {availableDesktops.length === 0 ? (
            <Text style={styles.helper}>{t.create.desktopEmpty}</Text>
          ) : (
            <View style={styles.chipsRow}>
              {availableDesktops.map((desktop) => {
                const isSelected = desktop.desktopId === selectedDesktopId;

                return (
                  <Pressable
                    accessibilityRole="button"
                    key={desktop.desktopId}
                    onPress={() => setSelectedDesktopId(desktop.desktopId)}
                    style={[styles.chip, isSelected && styles.chipActive]}
                  >
                    <Text
                      numberOfLines={1}
                      style={[styles.chipText, isSelected && styles.chipTextActive]}
                    >
                      {desktop.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t.create.workspace}</Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setWorkspacePath}
            placeholder={t.create.workspacePlaceholder}
            placeholderTextColor={colors.textSubtle}
            style={styles.input}
            value={workspacePath}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t.create.prompt}</Text>
          <TextInput
            multiline
            onChangeText={setPrompt}
            placeholder={t.create.promptPlaceholder}
            placeholderTextColor={colors.textSubtle}
            style={[styles.input, styles.promptInput]}
            textAlignVertical="top"
            value={prompt}
          />
        </View>
      </View>

      <FloatingActionButton
        accessibilityLabel={t.create.run}
        label={canRun ? t.create.run : t.create.running}
        onPress={canRun ? run : () => undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: spacing.lg,
    paddingHorizontal: spacing.lg
  },
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
  chipText: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: "600"
  },
  chipTextActive: {
    color: colors.primary
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  container: {
    flex: 1,
    gap: spacing.md
  },
  field: {
    gap: spacing.xs
  },
  helper: {
    ...typography.caption,
    color: colors.textMuted
  },
  input: {
    ...sharedStyles.input
  },
  label: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: "600"
  },
  promptInput: {
    minHeight: 160
  }
});
