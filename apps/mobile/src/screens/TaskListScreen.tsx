import type { AgentTask, AgentTaskStatus } from "@personal-ai-assistant/shared";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { colors, sharedStyles } from "../ui/styles";
import { statusColor, toDisplayTaskStatus } from "../utils/status";

export interface TaskHistoryFilters {
  status: AgentTaskStatus | "all";
  prompt: string;
  createdFrom: string;
  createdTo: string;
}

interface TaskListScreenProps {
  tasks: AgentTask[];
  isLoading: boolean;
  filters: TaskHistoryFilters;
  onApplyFilters: () => void;
  onClearHistory: () => void;
  onCreate: () => void;
  onDeleteTask: (taskId: string) => void;
  onFiltersChange: (filters: TaskHistoryFilters) => void;
  onOpenTask: (taskId: string) => void;
  onRefresh: () => void;
}

const STATUS_FILTERS: Array<AgentTaskStatus | "all"> = [
  "all",
  "created",
  "started",
  "running",
  "waiting_approval",
  "completed",
  "failed",
  "cancelled",
  "rejected"
];

export function TaskListScreen({
  tasks,
  isLoading,
  filters,
  onApplyFilters,
  onClearHistory,
  onCreate,
  onDeleteTask,
  onFiltersChange,
  onOpenTask,
  onRefresh
}: TaskListScreenProps) {
  const [isStatusMenuOpen, setStatusMenuOpen] = useState(false);
  const selectedStatusLabel = filters.status === "all" ? "All" : toDisplayTaskStatus(filters.status);

  const updateFilter = <Key extends keyof TaskHistoryFilters>(
    key: Key,
    value: TaskHistoryFilters[Key]
  ) => {
    onFiltersChange({
      ...filters,
      [key]: value
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View>
          <Text style={sharedStyles.label}>Tasks</Text>
          <Text style={sharedStyles.title}>Task history</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={onCreate} style={sharedStyles.button}>
          <Text style={sharedStyles.buttonText}>New</Text>
        </Pressable>
      </View>

      <View style={styles.filters}>
        <View style={styles.field}>
          <Text style={sharedStyles.label}>Task history</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setStatusMenuOpen((current) => !current)}
            style={styles.dropdownButton}
          >
            <Text style={styles.dropdownText}>{selectedStatusLabel}</Text>
            <Text style={styles.dropdownIcon}>{isStatusMenuOpen ? "Up" : "Down"}</Text>
          </Pressable>
          {isStatusMenuOpen ? (
            <View style={styles.dropdownMenu}>
              {STATUS_FILTERS.map((status) => {
                const isSelected = filters.status === status;
                const label = status === "all" ? "All" : toDisplayTaskStatus(status);

                return (
                  <Pressable
                    accessibilityRole="button"
                    key={status}
                    onPress={() => {
                      updateFilter("status", status);
                      setStatusMenuOpen(false);
                    }}
                    style={[styles.dropdownItem, isSelected && styles.dropdownItemSelected]}
                  >
                    <Text
                      style={[
                        styles.dropdownItemText,
                        isSelected && styles.dropdownItemTextSelected
                      ]}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>

        <View style={styles.field}>
          <Text style={sharedStyles.label}>Prompt keyword</Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={(value) => updateFilter("prompt", value)}
            placeholder="Search prompt"
            style={sharedStyles.input}
            value={filters.prompt}
          />
        </View>

        <View style={styles.fieldRow}>
          <View style={styles.field}>
            <Text style={sharedStyles.label}>Created from</Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={(value) => updateFilter("createdFrom", value)}
              placeholder="2026-05-01"
              style={sharedStyles.input}
              value={filters.createdFrom}
            />
          </View>
          <View style={styles.field}>
            <Text style={sharedStyles.label}>Created to</Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={(value) => updateFilter("createdTo", value)}
              placeholder="2026-05-14"
              style={sharedStyles.input}
              value={filters.createdTo}
            />
          </View>
        </View>

        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setStatusMenuOpen(false);
              onApplyFilters();
            }}
            style={[sharedStyles.button, styles.actionButton]}
          >
            <Text style={sharedStyles.buttonText}>{isLoading ? "Searching..." : "Search"}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={onRefresh}
            style={[sharedStyles.button, sharedStyles.buttonGhost, styles.actionButton]}
          >
            <Text style={[sharedStyles.buttonText, sharedStyles.buttonTextGhost]}>Refresh</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={onClearHistory}
            style={[sharedStyles.button, sharedStyles.buttonDanger, styles.actionButton]}
          >
            <Text style={sharedStyles.buttonText}>Clear</Text>
          </Pressable>
        </View>
      </View>

      <View style={tasks.length === 0 ? styles.emptyList : styles.list}>
        {tasks.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No tasks yet</Text>
            <Text style={sharedStyles.muted}>Create a task to stream Codex output here.</Text>
          </View>
        ) : (
          tasks.map((item) => {
            const displayStatus = toDisplayTaskStatus(item.status);

            return (
              <View key={item.id} style={sharedStyles.card}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => onOpenTask(item.id)}
                  style={({ pressed }) => pressed && styles.pressed}
                >
                  <View style={styles.taskHeader}>
                    <Text numberOfLines={1} style={styles.prompt}>
                      {item.prompt || "Untitled task"}
                    </Text>
                    <Text style={[styles.status, { color: statusColor(displayStatus) }]}>
                      {displayStatus}
                    </Text>
                  </View>
                  <Text style={sharedStyles.muted}>
                    {new Date(item.createdAt).toLocaleString()}
                  </Text>
                </Pressable>
                <View style={styles.taskActions}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => onDeleteTask(item.id)}
                    style={[sharedStyles.button, sharedStyles.buttonGhost, styles.deleteButton]}
                  >
                    <Text style={[sharedStyles.buttonText, sharedStyles.buttonTextGhost]}>
                      Delete
                    </Text>
                  </Pressable>
                </View>
              </View>
            );
          })
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12
  },
  actionButton: {
    flex: 1
  },
  actions: {
    flexDirection: "row",
    gap: 8
  },
  dropdownButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  dropdownIcon: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "700"
  },
  dropdownItem: {
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  dropdownItemSelected: {
    backgroundColor: "#eaf7f8"
  },
  dropdownItemText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600"
  },
  dropdownItemTextSelected: {
    color: colors.primary,
    fontWeight: "700"
  },
  dropdownMenu: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    overflow: "hidden"
  },
  dropdownText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700"
  },
  emptyList: {
    minHeight: 220,
    justifyContent: "center"
  },
  emptyState: {
    alignItems: "center",
    gap: 8,
    padding: 24
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700"
  },
  field: {
    flex: 1,
    gap: 6
  },
  fieldRow: {
    flexDirection: "row",
    gap: 10
  },
  filters: {
    gap: 10
  },
  headerRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  list: {
    gap: 10,
    paddingBottom: 24
  },
  pressed: {
    opacity: 0.75
  },
  prompt: {
    color: colors.text,
    flex: 1,
    fontSize: 16,
    fontWeight: "700"
  },
  status: {
    fontSize: 13,
    fontWeight: "700"
  },
  taskHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    marginBottom: 8
  },
  taskActions: {
    alignItems: "flex-end",
    marginTop: 12
  },
  deleteButton: {
    minHeight: 38,
    paddingHorizontal: 12,
    paddingVertical: 8
  }
});
