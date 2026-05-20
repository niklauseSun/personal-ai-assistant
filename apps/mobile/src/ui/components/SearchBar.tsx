import { StyleSheet, TextInput, View } from "react-native";
import { colors, radius, spacing, typography } from "../theme";
import { SearchIcon } from "../icons";
import { t } from "../i18n";

interface SearchBarProps {
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
}

export function SearchBar({ value, onChangeText, placeholder = t.search.placeholder }: SearchBarProps) {
  return (
    <View style={styles.wrapper}>
      <SearchIcon size={18} color={colors.textMuted} />
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textSubtle}
        returnKeyType="search"
        style={styles.input}
        value={value}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    ...typography.body,
    flex: 1,
    padding: 0
  },
  wrapper: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md
  }
});
