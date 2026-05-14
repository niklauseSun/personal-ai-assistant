import type { AgentTask, AgentTaskStatus } from "@personal-ai-assistant/shared";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
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
  onFiltersChange,
  onOpenTask,
  onRefresh
}: TaskListScreenProps) {
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
        <View style={styles.statusFilters}>
          {STATUS_FILTERS.map((status) => {
            const isSelected = filters.status === status;
            const label = status === "all" ? "All" : toDisplayTaskStatus(status);

            return (
              <Pressable
                accessibilityRole="button"
                key={status}
                onPress={() => updateFilter("status", status)}
                style={[styles.statusChip, isSelected && styles.statusChipSelected]}
              >
                <Text style={[styles.statusChipText, isSelected && styles.statusChipTextSelected]}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
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
            onPress={onApplyFilters}
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

      <FlatList
        contentContainerStyle={tasks.length === 0 ? styles.emptyList : styles.list}
        data={tasks}
        keyExtractor={(task) => task.id}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No tasks yet</Text>
            <Text style={sharedStyles.muted}>Create a task to stream Codex output here.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const displayStatus = toDisplayTaskStatus(item.status);

          return (
            <Pressable
              accessibilityRole="button"
              onPress={() => onOpenTask(item.id)}
              style={({ pressed }) => [sharedStyles.card, pressed && styles.pressed]}
            >
              <View style={styles.taskHeader}>
                <Text numberOfLines={1} style={styles.prompt}>
                  {item.prompt || "Untitled task"}
                </Text>
                <Text style={[styles.status, { color: statusColor(displayStatus) }]}>
                  {displayStatus}
                </Text>
              </View>
              <Text style={sharedStyles.muted}>{new Date(item.createdAt).toLocaleString()}</Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: 12
  },
  actionButton: {
    flex: 1
  },
  actions: {
    flexDirection: "row",
    gap: 8
  },
  emptyList: {
    flexGrow: 1,
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
  statusChip: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7
  },
  statusChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  statusChipText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700"
  },
  statusChipTextSelected: {
    color: "#ffffff"
  },
  statusFilters: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  taskHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    marginBottom: 8
  }
});
