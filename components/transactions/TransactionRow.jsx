import { Pressable, StyleSheet, View } from "react-native";

import { formatCurrency } from "../../utils/currency";
import { dayLabel } from "../../utils/dates";
import { Icon } from "../ui/Icon";
import { TagBadge } from "../ui/TagBadge";
import { Text } from "../ui/Text";
import { useTheme } from "../ui/ThemeProvider";

/**
 * One transaction in a budget. Transfers are shown without a tag and with a
 * neutral amount, because they move money between accounts rather than
 * counting as income or spending.
 */
export function TransactionRow({
  transaction,
  tag,
  currency,
  onEdit,
  onDelete,
  isLast,
}) {
  const { colors, spacing } = useTheme();

  const isExpense = transaction.type === "expense";
  const isIncome = transaction.type === "income";
  const sign = isIncome ? "+" : isExpense ? "-" : "";
  const tone = isIncome ? "income" : isExpense ? "expense" : "muted";

  const title =
    transaction.description ||
    (transaction.type === "transfer"
      ? "Transfer"
      : (tag?.name ?? "Transaction"));

  const showBadge = transaction.type !== "transfer" && Boolean(tag);

  // A reminder rides on the second line: it is the only extra marker a
  // transaction can carry.
  const hasReminder = transaction.reminder?.enabled === 1;
  const subtitleParts =
    transaction.type === "transfer"
      ? [dayLabel(transaction.transaction_date)]
      : [dayLabel(transaction.transaction_date), hasReminder ? "🔔" : null];
  const subtitle = subtitleParts.filter(Boolean).join(" · ");
  const a11yTag = showBadge ? tag.name : null;
  const a11ySuffixes = [a11yTag, hasReminder ? "reminder set" : null].filter(
    Boolean,
  );

  return (
    <View
      style={[
        styles.row,
        {
          borderBottomColor: colors.border,
          borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth,
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
        },
      ]}
    >
      {/* The row surface and the delete action are siblings, not nested —
          nested pressables render as buttons inside buttons on web. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Edit ${title}${
          a11ySuffixes.length ? `, ${a11ySuffixes.join(", ")}` : ""
        }`}
        onPress={onEdit ? () => onEdit(transaction) : undefined}
        disabled={!onEdit}
        style={({ pressed }) => [
          styles.pressable,
          {
            backgroundColor:
              pressed && onEdit ? colors.surfaceMuted : "transparent",
          },
        ]}
      >
        <View style={styles.left}>
          {showBadge ? <TagBadge tag={tag} size="md" showName={false} /> : null}
          <View
            style={[styles.copy, { marginLeft: showBadge ? spacing.sm : 0 }]}
          >
            <Text variant="body" numberOfLines={1}>
              {title}
            </Text>
            {subtitle && subtitle !== title ? (
              <Text
                variant="caption"
                tone="faint"
                numberOfLines={1}
                style={{ marginTop: 1 }}
              >
                {subtitle}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.right}>
          <Text variant="body" tone={tone} style={styles.amount}>
            {sign}
            {formatCurrency(transaction.amount, { currency })}
          </Text>
        </View>
      </Pressable>

      {onDelete ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Delete ${title}`}
          onPress={onDelete}
          hitSlop={10}
          style={({ pressed }) => [
            styles.delete,
            { marginLeft: spacing.sm, opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <Icon name="trash" size={16} color={colors.textFaint} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: "center",
    flexDirection: "row",
  },
  pressable: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    minWidth: 0,
  },
  delete: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 32,
    minWidth: 32,
  },
  left: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    minWidth: 0,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  right: {
    alignItems: "flex-end",
    marginLeft: 8,
  },
  amount: {
    fontVariant: ["tabular-nums"],
  },
});
