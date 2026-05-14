import { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { sharedStyles } from "../ui/styles";

interface CreateTaskScreenProps {
  canRun: boolean;
  onBack: () => void;
  onRun: (input: { workspacePath: string; prompt: string }) => void;
}

export function CreateTaskScreen({ canRun, onBack, onRun }: CreateTaskScreenProps) {
  const [workspacePath, setWorkspacePath] = useState("");
  const [prompt, setPrompt] = useState("");

  const run = () => {
    if (!workspacePath.trim()) {
      Alert.alert("Missing workspace", "Enter the desktop workspace path.");
      return;
    }

    if (!prompt.trim()) {
      Alert.alert("Missing prompt", "Enter a prompt for Codex.");
      return;
    }

    onRun({
      workspacePath: workspacePath.trim(),
      prompt: prompt.trim()
    });
    setPrompt("");
  };

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
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
    </ScrollView>
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
