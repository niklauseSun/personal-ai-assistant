import type {
  AgentTask,
  ApprovalDecision,
  ApprovalRequest,
  OutputChunk
} from "@personal-ai-assistant/shared";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { AppHeader, IconButton, StatusBadge } from "../ui/components";
import { ChevronLeftIcon, RefreshIcon } from "../ui/icons";
import { colors, radius, shadows, spacing, typography } from "../ui/theme";
import { t } from "../ui/i18n";
import { sharedStyles } from "../ui/styles";
import { toDisplayTaskStatus } from "../utils/status";
import { formatRelativeTimestamp } from "../utils/format";

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
      <View style={styles.notFound}>
        <AppHeader
          title={t.detail.title}
          actions={
            <IconButton accessibilityLabel={t.scan.back} onPress={onBack}>
              <ChevronLeftIcon size={22} color={colors.text} />
            </IconButton>
          }
        />
      </View>
    );
  }

  const displayStatus = toDisplayTaskStatus(task.status);
  const latestApproval = approvals[approvals.length - 1];
  const isPendingApproval = latestApproval?.status === "pending";

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <AppHeader
        title={t.detail.title}
        actions={
          <>
            <IconButton accessibilityLabel={t.detail.refresh} onPress={() => onRefresh(task.id)}>
              <RefreshIcon size={22} color={colors.text} />
            </IconButton>
            <IconButton accessibilityLabel={t.scan.back} onPress={onBack}>
              <ChevronLeftIcon size={22} color={colors.text} />
            </IconButton>
          </>
        }
      />

      <View style={styles.padded}>
        <View style={styles.summaryCard}>
          <Text style={styles.label}>{t.detail.promptLabel}</Text>
          <Text style={styles.prompt}>{task.prompt || "—"}</Text>
          <View style={styles.metaRow}>
            <StatusBadge status={displayStatus} />
            <Text style={styles.meta}>{formatRelativeTimestamp(task.createdAt)}</Text>
          </View>
        </View>

        <View style={styles.actionsRow}>
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
            <Text style={sharedStyles.buttonText}>
              {canCancel ? t.detail.cancel : t.detail.cancelling}
            </Text>
          </Pressable>
        </View>
      </View>

      {latestApproval ? (
        <View style={styles.padded}>
          <View style={styles.approvalCard}>
            <View style={styles.approvalHeader}>
              <Text style={styles.approvalTitle}>{latestApproval.title || t.detail.approvalTitle}</Text>
              <Text style={styles.riskBadge}>{latestApproval.riskLevel}</Text>
            </View>
            <Text style={styles.approvalDescription}>
              {latestApproval.description || latestApproval.message || ""}
            </Text>
            {isPendingApproval ? (
              <View style={styles.actionsRow}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => onSubmitApproval(task.id, latestApproval.id, "approved")}
                  style={[sharedStyles.button, styles.actionButton]}
                >
                  <Text style={sharedStyles.buttonText}>{t.detail.approve}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => onSubmitApproval(task.id, latestApproval.id, "rejected")}
                  style={[sharedStyles.button, sharedStyles.buttonDanger, styles.actionButton]}
                >
                  <Text style={sharedStyles.buttonText}>{t.detail.reject}</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        </View>
      ) : null}

      <View style={styles.padded}>
        <Text style={styles.sectionTitle}>{t.detail.outputTitle}</Text>
        {outputs.length === 0 ? (
          <View style={styles.emptyOutput}>
            <Text style={styles.label}>{t.detail.outputEmpty}</Text>
          </View>
        ) : (
          <View style={styles.outputList}>
            {outputs.map((item) => (
              <View key={item.id} style={styles.outputRow}>
                <Text style={styles.stream}>{item.stream}</Text>
                <Text selectable style={styles.outputText}>
                  {item.content}
                </Text>
              </View>
            ))}
            {hasMoreOutputs ? (
              <Pressable
                accessibilityRole="button"
                disabled={isLoadingOutputs}
                onPress={() => onLoadMoreOutputs(task.id)}
                style={[
                  sharedStyles.button,
                  sharedStyles.buttonGhost,
                  isLoadingOutputs && styles.disabled
                ]}
              >
                <Text style={[sharedStyles.buttonText, sharedStyles.buttonTextGhost]}>
                  {isLoadingOutputs ? t.detail.refreshing : t.detail.outputLoadMore}
                </Text>
              </Pressable>
            ) : null}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  actionButton: {
    flex: 1
  },
  actionsRow: {
    flexDirection: "row",
    gap: spacing.md
  },
  approvalCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    gap: spacing.sm,
    padding: spacing.lg,
    ...shadows.card
  },
  approvalDescription: {
    ...typography.body,
    color: colors.text
  },
  approvalHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  approvalTitle: {
    ...typography.sectionTitle,
    flex: 1,
    marginRight: spacing.md
  },
  content: {
    gap: spacing.md,
    paddingBottom: 80
  },
  disabled: {
    opacity: 0.5
  },
  emptyOutput: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadows.card
  },
  label: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: "600"
  },
  meta: {
    ...typography.caption,
    color: colors.textMuted
  },
  metaRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xs
  },
  notFound: {
    flex: 1
  },
  outputList: {
    gap: spacing.sm
  },
  outputRow: {
    backgroundColor: colors.terminalBg,
    borderRadius: radius.lg,
    padding: spacing.md
  },
  outputText: {
    ...typography.mono,
    color: colors.terminalText,
    lineHeight: 18
  },
  padded: {
    gap: spacing.md,
    paddingHorizontal: spacing.lg
  },
  prompt: {
    ...typography.body,
    color: colors.text,
    marginTop: spacing.xs
  },
  riskBadge: {
    ...typography.micro,
    backgroundColor: colors.statusPendingSoft,
    borderRadius: radius.pill,
    color: colors.statusPending,
    overflow: "hidden",
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    textTransform: "uppercase"
  },
  sectionTitle: {
    ...typography.sectionTitle
  },
  stream: {
    ...typography.micro,
    color: "#93c5fd",
    marginBottom: spacing.xs,
    textTransform: "uppercase"
  },
  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    gap: spacing.xs,
    padding: spacing.lg,
    ...shadows.card
  }
});
