import { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { colors, sharedStyles } from "../ui/styles";

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
      Alert.alert("Missing workspace", "Enter the desktop workspace path.");
      return;
    }

    if (!prompt.trim()) {
      Alert.alert("Missing prompt", "Enter a prompt for Codex.");
      return;
    }

    if (availableDesktops.length > 0 && !selectedDesktopId) {
      Alert.alert("Choose a desktop", "Select which desktop should run Codex.");
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
      <View style={styles.headerRow}>
        <View>
          <Text style={sharedStyles.label}>Create</Text>
          <Text style={sharedStyles.title}>Run Codex</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={onBack}
          style={[sharedStyles.button, sharedStyles.buttonGhost]}
        >
          <Text style={[sharedStyles.buttonText, sharedStyles.buttonTextGhost]}>Back</Text>
        </Pressable>
      </View>

      <View style={styles.field}>
        <Text style={sharedStyles.label}>Desktop</Text>
        {availableDesktops.length === 0 ? (
          <Text style={sharedStyles.muted}>
            No desktop is online yet. You can still run with legacy broadcast routing.
          </Text>
        ) : (
          <View style={styles.desktopList}>
            {availableDesktops.map((desktop) => {
              const isSelected = desktop.desktopId === selectedDesktopId;

              return (
                <Pressable
                  accessibilityRole="button"
                  key={desktop.desktopId}
                  onPress={() => setSelectedDesktopId(desktop.desktopId)}
                  style={[styles.desktopOption, isSelected && styles.desktopOptionSelected]}
                >
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.desktopOptionText,
                      isSelected && styles.desktopOptionTextSelected
                    ]}
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
        <Text style={sharedStyles.label}>Workspace path</Text>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={setWorkspacePath}
          placeholder="/Users/me/code/project"
          style={sharedStyles.input}
          value={workspacePath}
        />
      </View>

      <View style={styles.field}>
        <Text style={sharedStyles.label}>Prompt</Text>
        <TextInput
          multiline
          onChangeText={setPrompt}
          placeholder="Describe the coding task..."
          style={[sharedStyles.input, styles.promptInput]}
          textAlignVertical="top"
          value={prompt}
        />
      </View>

      <Pressable
        accessibilityRole="button"
        disabled={!canRun}
        onPress={run}
        style={[sharedStyles.button, !canRun && styles.disabled]}
      >
        <Text style={sharedStyles.buttonText}>{canRun ? "Run" : "Connect first"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
    paddingBottom: 24
  },
  disabled: {
    backgroundColor: "#9aa8b2"
  },
  desktopList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  desktopOption: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    maxWidth: "100%",
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  desktopOptionSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  desktopOptionText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "700"
  },
  desktopOptionTextSelected: {
    color: "#ffffff"
  },
  field: {
    gap: 8
  },
  headerRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  promptInput: {
    minHeight: 180
  }
});
