import type { AgentTask, MobileBoundDesktop } from "@personal-ai-assistant/shared";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  AppHeader,
  CommandCard,
  IconButton,
  LinkedDeviceCard,
  SearchBar,
  SectionHeader,
  StatusFilterChips,
  type StatusFilterValue
} from "../ui/components";
import { BellIcon, LinkIcon, RefreshIcon, ScanIcon } from "../ui/icons";
import { colors, radius, shadows, spacing, typography } from "../ui/theme";
import { t } from "../ui/i18n";
import { toDisplayTaskStatus } from "../utils/status";
import {
  deriveCommandDescription,
  deriveCommandTitle,
  formatDurationLabel,
  formatRelativeTimestamp
} from "../utils/format";

interface HomeScreenProps {
  tasks: AgentTask[];
  isLoadingHistory: boolean;
  searchText: string;
  statusFilter: StatusFilterValue;
  activeDesktop?: MobileBoundDesktop;
  desktopOnline: boolean;
  mobileLabel?: string;
  errorMessage?: string;
  onSearchChange: (next: string) => void;
  onStatusFilterChange: (next: StatusFilterValue) => void;
  onCreate: () => void;
  onOpenTask: (taskId: string) => void;
  onRefresh: () => void;
  onScan: () => void;
  onOpenDrawer: () => void;
  onBindingHelp: () => void;
}

export function HomeScreen({
  tasks,
  isLoadingHistory,
  searchText,
  statusFilter,
  activeDesktop,
  desktopOnline,
  mobileLabel,
  errorMessage,
  onSearchChange,
  onStatusFilterChange,
  onOpenTask,
  onRefresh,
  onScan,
  onOpenDrawer,
  onBindingHelp
}: HomeScreenProps) {
  const bound = Boolean(activeDesktop);

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <AppHeader
        title={t.app.title}
        actions={
          <>
            <IconButton accessibilityLabel={t.header.notifications}>
              <BellIcon size={22} color={colors.text} />
            </IconButton>
            <IconButton accessibilityLabel={t.header.scan} onPress={onScan}>
              <ScanIcon size={22} color={colors.text} />
            </IconButton>
          </>
        }
      />

      <View style={styles.padded}>
        <LinkedDeviceCard
          bound={bound}
          deviceName={activeDesktop?.desktopName}
          online={desktopOnline}
          mobileLabel={mobileLabel}
          onPress={onOpenDrawer}
          onSyncPress={onRefresh}
          onBindPress={onScan}
        />
        {!bound ? (
          <Pressable
            accessibilityRole="button"
            onPress={onBindingHelp}
            style={({ pressed }) => [styles.helpRow, pressed && styles.helpPressed]}
          >
            <LinkIcon size={16} color={colors.primary} />
            <Text style={styles.helpText}>{t.device.bindHelp}</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.padded}>
        <SearchBar value={searchText} onChangeText={onSearchChange} />
      </View>
      <StatusFilterChips value={statusFilter} onChange={onStatusFilterChange} />

      <View style={styles.padded}>
        <SectionHeader
          title={t.command.recentTitle}
          actionLabel={t.command.refresh}
          actionIcon={<RefreshIcon size={18} color={colors.textMuted} />}
          onActionPress={onRefresh}
        />
      </View>

      {errorMessage ? (
        <View style={styles.padded}>
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        </View>
      ) : null}

      {tasks.length === 0 ? (
        <View style={styles.padded}>
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>
              {isLoadingHistory ? t.command.runningLabel : t.command.empty}
            </Text>
            <Text style={styles.emptyHint}>{t.command.emptyHint}</Text>
          </View>
        </View>
      ) : (
        <View style={styles.list}>
          {tasks.map((task) => {
            const status = toDisplayTaskStatus(task.status);
            const workspacePath = readMetadataString(task.metadata, "workspacePath");
            const description = deriveCommandDescription(task.prompt, workspacePath);
            const duration =
              status === "running"
                ? t.command.runningLabel
                : formatDurationLabel(task.createdAt, task.completedAt ?? task.updatedAt);

            return (
              <CommandCard
                description={description}
                durationLabel={duration}
                key={task.id}
                onPress={() => onOpenTask(task.id)}
                status={status}
                timeLabel={formatRelativeTimestamp(task.createdAt)}
                title={deriveCommandTitle(task.prompt)}
              />
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

function readMetadataString(metadata: AgentTask["metadata"], key: string): string | undefined {
  if (!metadata || typeof metadata !== "object") {
    return undefined;
  }

  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
    paddingBottom: 120
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    gap: spacing.xs,
    padding: spacing.lg,
    ...shadows.card
  },
  emptyHint: {
    ...typography.caption,
    color: colors.textMuted
  },
  emptyTitle: {
    ...typography.bodyStrong
  },
  errorBanner: {
    backgroundColor: colors.statusFailedSoft,
    borderRadius: radius.md,
    padding: spacing.md
  },
  errorText: {
    ...typography.caption,
    color: colors.statusFailed,
    fontWeight: "600"
  },
  helpPressed: {
    opacity: 0.6
  },
  helpRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs,
    justifyContent: "center",
    paddingTop: spacing.sm
  },
  helpText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: "600"
  },
  list: {
    gap: spacing.md,
    paddingHorizontal: spacing.lg
  },
  padded: {
    gap: spacing.md,
    paddingHorizontal: spacing.lg
  }
});
