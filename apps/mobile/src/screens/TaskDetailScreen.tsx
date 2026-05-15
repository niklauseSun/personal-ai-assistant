import type {
  AgentTask,
  ApprovalDecision,
  ApprovalRequest,
  OutputChunk
} from "@personal-ai-assistant/shared";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, sharedStyles } from "../ui/styles";
import { statusColor, toDisplayTaskStatus } from "../utils/status";

interface TaskDetailScreenProps {
  task: AgentTask | undefined;
  outputs: OutputChunk[];
  approvals: ApprovalRequest[];
  canCancel: boolean;
  hasMoreOutputs: boolean;
  isLoadingOutputs: boolean;
  onBack: () => void;
  onCancel: (taskId: string) => void;
  onLoadMoreOutputs: (taskId: string) => void;
  onSubmitApproval: (
    taskId: string,
    approvalRequestId: string,
    decision: ApprovalDecision
  ) => void;
  onRefresh: (taskId: string) => void;
}

export function TaskDetailScreen({
  task,
  outputs,
  approvals,
  canCancel,
  hasMoreOutputs,
  isLoadingOutputs,
  onBack,
  onCancel,
  onLoadMoreOutputs,
  onSubmitApproval,
  onRefresh
}: TaskDetailScreenProps) {
  if (!task) {
    return (
      <View style={styles.container}>
        <Text style={sharedStyles.title}>Task not found</Text>
        <Pressable
          accessibilityRole="button"
          onPress={onBack}
          style={[sharedStyles.button, sharedStyles.buttonGhost]}
        >
          <Text style={[sharedStyles.buttonText, sharedStyles.buttonTextGhost]}>Back</Text>
        </Pressable>
      </View>
    );
  }

  const displayStatus = toDisplayTaskStatus(task.status);
  const latestApproval = approvals[approvals.length - 1];
  const isPendingApproval = latestApproval?.status === "pending";

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text style={sharedStyles.label}>Task detail</Text>
          <Text numberOfLines={2} style={sharedStyles.title}>
            {task.prompt || "Untitled task"}
          </Text>
          <Text style={[styles.status, { color: statusColor(displayStatus) }]}>
            {displayStatus}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={onBack}
          style={[sharedStyles.button, sharedStyles.buttonGhost]}
        >
          <Text style={[sharedStyles.buttonText, sharedStyles.buttonTextGhost]}>Back</Text>
        </Pressable>
      </View>

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          onPress={() => onRefresh(task.id)}
          style={[sharedStyles.button, sharedStyles.buttonGhost, styles.actionButton]}
        >
          <Text style={[sharedStyles.buttonText, sharedStyles.buttonTextGhost]}>Refresh</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={!canCancel}
          onPress={() => onCancel(task.id)}
          style={[
            sharedStyles.button,
            sharedStyles.buttonDanger,
            styles.actionButton,
            !canCancel && styles.disabled
          ]}
        >
          <Text style={sharedStyles.buttonText}>Cancel</Text>
        </Pressable>
      </View>

      {latestApproval ? (
        <View style={sharedStyles.card}>
          <View style={styles.approvalHeader}>
            <View style={styles.headerText}>
              <Text style={sharedStyles.label}>Approval</Text>
              <Text style={styles.approvalTitle}>{latestApproval.title}</Text>
            </View>
            <Text style={styles.riskBadge}>{latestApproval.riskLevel}</Text>
          </View>
          <Text style={styles.approvalDescription}>
            {latestApproval.description || latestApproval.message || "Approval required."}
          </Text>
          <Text style={sharedStyles.muted}>Status: {latestApproval.status}</Text>
          {isPendingApproval ? (
            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                onPress={() => onSubmitApproval(task.id, latestApproval.id, "approved")}
                style={[sharedStyles.button, styles.actionButton]}
              >
                <Text style={sharedStyles.buttonText}>Approve</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => onSubmitApproval(task.id, latestApproval.id, "rejected")}
                style={[sharedStyles.button, sharedStyles.buttonDanger, styles.actionButton]}
              >
                <Text style={sharedStyles.buttonText}>Reject</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={outputs.length === 0 ? styles.emptyOutput : styles.outputList}>
        {outputs.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No output yet</Text>
            <Text style={sharedStyles.muted}>Output will appear as Codex writes stdout/stderr.</Text>
          </View>
        ) : (
          outputs.map((item) => (
            <View key={item.id} style={styles.outputRow}>
              <Text style={styles.stream}>{item.stream}</Text>
              <Text selectable style={styles.outputText}>
                {item.content}
              </Text>
            </View>
          ))
        )}
        {hasMoreOutputs ? (
          <Pressable
            accessibilityRole="button"
            disabled={isLoadingOutputs}
            onPress={() => onLoadMoreOutputs(task.id)}
            style={[
              sharedStyles.button,
              sharedStyles.buttonGhost,
              styles.loadMoreButton,
              isLoadingOutputs && styles.disabled
            ]}
          >
            <Text style={[sharedStyles.buttonText, sharedStyles.buttonTextGhost]}>
              {isLoadingOutputs ? "Loading..." : "Load more output"}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  actionButton: {
    flex: 1
  },
  actions: {
    flexDirection: "row",
    gap: 10
  },
  approvalDescription: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20
  },
  approvalHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    marginBottom: 10
  },
  approvalTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700"
  },
  container: {
    gap: 12
  },
  disabled: {
    backgroundColor: "#9aa8b2"
  },
  emptyOutput: {
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
  headerRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between"
  },
  headerText: {
    flex: 1,
    gap: 6
  },
  loadMoreButton: {
    marginTop: 4
  },
  outputList: {
    gap: 8,
    paddingBottom: 24
  },
  outputRow: {
    backgroundColor: "#111827",
    borderRadius: 8,
    padding: 12
  },
  outputText: {
    color: "#e5e7eb",
    fontFamily: "Courier",
    fontSize: 13,
    lineHeight: 18
  },
  riskBadge: {
    backgroundColor: "#fff7ed",
    borderColor: "#fed7aa",
    borderRadius: 8,
    borderWidth: 1,
    color: "#9a3412",
    fontSize: 12,
    fontWeight: "700",
    paddingHorizontal: 10,
    paddingVertical: 5,
    textTransform: "uppercase"
  },
  status: {
    fontSize: 13,
    fontWeight: "700"
  },
  stream: {
    color: "#93c5fd",
    fontSize: 11,
    fontWeight: "700",
    marginBottom: 6,
    textTransform: "uppercase"
  }
});
