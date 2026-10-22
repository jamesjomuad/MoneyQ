import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { FolderPickerSheet } from '../../components/budgets/FolderPickerSheet';
import { TagSpendRow } from '../../components/tags/TagSpendRow';
import { TransactionRow } from '../../components/transactions/TransactionRow';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { FAB_SIZE, Fab } from '../../components/ui/Fab';
import { Icon } from '../../components/ui/Icon';
import { Screen, SectionHeader } from '../../components/ui/Screen';
import { Stat } from '../../components/ui/Stat';
import { SwipeActionRow, closeAllSwipeActions } from '../../components/ui/SwipeActionRow';
import { Text } from '../../components/ui/Text';
import { useTheme } from '../../components/ui/ThemeProvider';
import { useBudgetDetailStore } from '../../stores/budgetDetailStore';
import { useBudgetsStore } from '../../stores/budgetsStore';
import { useFoldersStore } from '../../stores/foldersStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { showToast } from '../../stores/toastStore';
import { groupByDate } from '../../utils/calculations';
import { formatCurrency } from '../../utils/currency';
import { isHexColor, resolveFolderPalette } from '../../utils/colors';
import { dayLabel, formatDateRange } from '../../utils/dates';

/** Parse a `#rgb`/`#rrggbb` theme color to [r, g, b]. */
function hexToRgb(hex) {
  const h = String(hex).replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Linear blend between two hex colors, t in [0, 1]. */
function mixHex(a, b, t) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const r = Math.round(ca[0] + (cb[0] - ca[0]) * t);
  const g = Math.round(ca[1] + (cb[1] - ca[1]) * t);
  const bl = Math.round(ca[2] + (cb[2] - ca[2]) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}

/**
 * Spend gauge color: green when nothing is spent, orange at half of income,
 * red at or above income. Anchored on theme tokens so every palette (light,
 * dark, Budgetarian) stays consistent.
 */
function spendColor(colors, percent) {
  const p = Math.min(1, Math.max(0, percent / 100));
  if (p <= 0.5) return mixHex(colors.income, colors.warning, p / 0.5);
  return mixHex(colors.warning, colors.expense, (p - 0.5) / 0.5);
}

/**
 * Privacy mask for the Remaining amount: every digit becomes a bullet and the
 * thousands/decimal separators drop out, so `₱1,000.00` reads as `₱••••••`.
 * Purely cosmetic — the value it masks is never altered.
 */
function maskAmountText(text) {
  return text.replace(/\d/g, '•').replace(/[,.]/g, '');
}

/** Height of the drawer's handle strip that stays visible below the card. */
const DRAWER_PEEK = 32;

/**
 * Rows of the tag grid the expanded drawer shows. The first rendered row is
 * measured live (onLayout) so three REAL rows fit at any device font scale;
 * TAG_ROW_FALLBACK (12+12 padding + 32-high badge header + 8 gap + 16-high
 * caption row ≈ 80) only covers the very first frame before the measurement
 * lands.
 */
const TAG_DRAWER_ROWS = 3;
const TAG_ROW_FALLBACK = 80;

/**
 * Tags drawer: the budget's tag filter, parked in the pinned overlay directly
 * beneath the Remaining card instead of at the head of the scroll body. Its
 * top is pulled UNDER the card by a negative margin (spacing.lg), so it always
 * sits attached to the card's bottom edge — emerging from behind it, never
 * floating below it with a gap — and the drawer's rounded top corners stay
 * concealed behind the card's opaque surface (a lower zIndex keeps the card in
 * front). Collapsed by default: only the rounded handle strip shows below the
 * card, most of the content still hidden behind it. Tapping the chevron
 * slides the whole drawer further downward on a pure transform animation,
 * keeping the top overlap, so the Remaining figure never moves or gets
 * covered. A clip window sitting in the card's shadow cuts the drawer off at
 * the card's bottom edge, so the drawer may always grow to its real height —
 * three full rows even on a short card — and whatever is taller than the
 * card is simply clipped behind it, never poking out. Tag selection,
 * filtering, the capped inner scroll, and the empty state are the section's
 * original markup, relocated untouched.
 */
function TagsDrawer({
  activeTagId,
  currency,
  onManageTags,
  onSetActiveTag,
  onToggle,
  open,
  tagSummaries,
}) {
  const { colors, spacing } = useTheme();
  // How deep the drawer's top is tucked behind the card at rest. A spacing
  // token (not a screen coordinate): it hides the drawer's radius-lg top
  // corners exactly and scales with the theme.
  const overlap = spacing.lg;
  const reduced = useReducedMotion();
  const progress = useSharedValue(0); // 0 = collapsed behind the card, 1 = expanded
  const drawerHeight = useSharedValue(0); // measured on first layout
  // Live-measured height of one grid row and of the Clear-filter strip, so
  // the expanded drawer reserves exactly TAG_DRAWER_ROWS real rows on any
  // device font scale (the strip unmounts -> back to 0).
  const [rowHeight, setRowHeight] = useState(TAG_ROW_FALLBACK);
  const [filterHeight, setFilterHeight] = useState(0);
  const rowsHeight = TAG_DRAWER_ROWS * rowHeight + (TAG_DRAWER_ROWS - 1) * spacing.sm;

  useEffect(() => {
    progress.value = withTiming(open ? 1 : 0, { duration: reduced ? 0 : 220 });
  }, [open, reduced, progress]);

  // The rest position (expanded) already tucks `overlap` behind the card via
  // the negative margin, so translateY stays 0. Collapsed rides further up,
  // (DRAWER_PEEK + overlap - height), until only the handle strip clears the
  // card's bottom edge. Before the first measurement a flat -400 hides it
  // completely, so nothing ever flashes expanded on arrival.
  const drawerStyle = useAnimatedStyle(() => {
    const collapsed =
      drawerHeight.value === 0
        ? -400
        : Math.min(0, DRAWER_PEEK + overlap - drawerHeight.value);
    return { transform: [{ translateY: collapsed * (1 - progress.value) }] };
  });

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${progress.value * 180}deg` }],
  }));

  const activeTag =
    tagSummaries.find((entry) => entry.tag.id === activeTagId)?.tag ?? null;

  return (
    // Clip window: a transparent overflow-hidden box whose top edge sits
    // `overlap` above the card's bottom (the tuck now lives on this margin).
    // Whatever the drawer rides up into when collapsed is cut at that edge —
    // squarely behind the opaque card, invisible — so the drawer is free to
    // grow taller than the card itself. paddingBottom restores the handle's
    // hitSlop room below the clipped box.
    <View
      pointerEvents="box-none"
      style={{ marginTop: -overlap, paddingBottom: 16, overflow: 'hidden', zIndex: 1 }}
    >
      <Animated.View
        onLayout={(e) => {
          drawerHeight.value = e.nativeEvent.layout.height;
        }}
        style={[styles.tagsDrawer, drawerStyle, { marginHorizontal: spacing.sm }]}
      >
      <Card
        padded={false}
        style={{
          // Room for the three measured grid rows, the Clear-filter strip if
          // it's showing, and the drawer's own chrome (top pad = overlap +
          // spacing.lg, bottom pad, handle strip). No card-height ceiling
          // any more: the clip window hides whatever extends above the card,
          // so three real rows always fit.
          //
          // Readability: Dark and Budgetarian paint the drawer one step ABOVE
          // the Remaining card's surface (colors.surface) via the
          // surfaceElevated token, so the boundary between the two cards and
          // the screen reads even where shadows die out. Light keeps white on
          // white there, where the hairline border and drop shadow already
          // carry the separation. No hardcoded colors.
          backgroundColor: colors.surfaceElevated,
          maxHeight:
            rowsHeight +
            (activeTag ? filterHeight : 0) +
            overlap +
            spacing.lg +
            spacing.sm +
            DRAWER_PEEK +
            10, // slack for hairline borders and font rounding
          overflow: 'hidden',
          boxShadow: `0 4px 12px ${colors.shadow}`,
        }}
      >
        <View
          style={[
            styles.drawerBody,
            {
              paddingBottom: spacing.sm,
              paddingHorizontal: spacing.md,
              // The drawer's top `overlap` hides behind the Remaining card,
              // so add it back before the first content row, with a generous
              // spacing.lg gap under the card's bottom edge.
              paddingTop: overlap + spacing.lg,
            },
          ]}
        >
          {/* The strip's onLayout reserves it (plus margin) in the drawer
              height; the max-height math only counts it while activeTag is
              set, so no reset is needed when the strip unmounts. */}
          {activeTag ? (
            <View
              style={{ alignItems: 'flex-end', marginBottom: spacing.xs }}
              onLayout={(e) =>
                setFilterHeight(e.nativeEvent.layout.height + spacing.xs)
              }
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Clear tag filter for ${activeTag.name}`}
                onPress={() => onSetActiveTag(null)}
                hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
              >
                <Text variant="label" tone="primary">
                  Clear filter
                </Text>
              </Pressable>
            </View>
          ) : null}

          <ScrollView
            style={styles.tagScroll}
            nestedScrollEnabled
            showsVerticalScrollIndicator
          >
            {tagSummaries.length === 0 ? (
              <EmptyState
                icon="tag"
                title="No tags used yet"
                description="Tags appear here once an income or expense in this budget references one."
              >
                <Button label="Manage tags" icon="tag" onPress={onManageTags} />
              </EmptyState>
            ) : (
              <View style={[styles.tagGrid, { gap: spacing.sm }]}>
                {tagSummaries.map(({ tag, spent, expensePercent }, index) => (
                  <View
                    key={tag.id}
                    style={styles.tagGridItem}
                    onLayout={
                      index === 0
                        ? (e) => setRowHeight(e.nativeEvent.layout.height)
                        : undefined
                    }
                  >
                    <TagSpendRow
                      tag={tag}
                      spent={spent}
                      expensePercent={expensePercent}
                      currency={currency}
                      active={tag.id === activeTagId}
                      onPress={() =>
                        onSetActiveTag(tag.id === activeTagId ? null : tag.id)
                      }
                    />
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        </View>

        {/* Handle strip: the drawer's bottom edge — the Insights label sits
            beside the chevron, both horizontally centered. It rides with
            the drawer, so collapsed it is the only part in view and also
            the toggle. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={open ? 'Collapse insights drawer' : 'Expand insights drawer'}
          accessibilityState={{ expanded: open }}
          hitSlop={6}
          onPress={onToggle}
          style={({ pressed }) => [
            styles.drawerHandle,
            { borderTopColor: colors.border, opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <Text variant="label">{`Insights · ${tagSummaries.length}`}</Text>
          <Animated.View style={chevronStyle}>
            <Icon name="chevronDown" size={18} color={colors.textMuted} />
          </Animated.View>
        </Pressable>
      </Card>
      </Animated.View>
    </View>
  );
}

export default function BudgetDetailScreen() {
  const { id: routeBudgetId } = useLocalSearchParams();
  const budgetId =
    typeof routeBudgetId === 'string'
      ? routeBudgetId
      : Array.isArray(routeBudgetId)
        ? routeBudgetId[0] ?? ''
        : '';
  const { colors, spacing } = useTheme();
  const currency = useSettingsStore((state) => state.currency);

  const budget = useBudgetDetailStore((state) => state.budget);
  const summary = useBudgetDetailStore((state) => state.summary);
  const tagSummaries = useBudgetDetailStore((state) => state.tagSummaries);
  const transactions = useBudgetDetailStore((state) => state.transactions);
  const activeTagId = useBudgetDetailStore((state) => state.activeTagId);
  const storeBudgetId = useBudgetDetailStore((state) => state.budgetId);
  const error = useBudgetDetailStore((state) => state.error);
  const loadError = useBudgetDetailStore((state) => state.loadError);
  const load = useBudgetDetailStore((state) => state.load);
  const setActiveTag = useBudgetDetailStore((state) => state.setActiveTag);
  const removeTransaction = useBudgetDetailStore((state) => state.removeTransaction);
  const archiveMany = useBudgetsStore((state) => state.archiveMany);
  const moveToFolder = useBudgetsStore((state) => state.moveToFolder);
  const folders = useFoldersStore((state) => state.folders);
  const loadFolders = useFoldersStore((state) => state.load);

  // Fold long lists so the summary card stays in reach; the headers remain so
  // a folded section can be reopened. The tag drawer beneath the pinned card
  // is a separate, collapsed-by-default surface.
  const [tagsDrawerOpen, setTagsDrawerOpen] = useState(false);
  const [transactionsOpen, setTransactionsOpen] = useState(true);
  // Measured height of the floating summary card, so the scroll body can
  // reserve exactly the space it occupies (same trick as the transaction
  // form's sticky Amount card).
  const [cardHeight, setCardHeight] = useState(0);
  // Privacy toggle for the pinned Remaining amount only — display state,
  // lives with this screen, touches no stored data and no other figures.
  // Privacy is on by default: the amount starts masked until revealed.
  const [remainingVisible, setRemainingVisible] = useState(false);
  // Budget-folder quick move: opening the picker is display state; the move
  // itself goes through the budgets store (which re-reads from the repository).
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (budgetId) {
        load(budgetId);
        loadFolders();
        // Every time this budget is opened the drawer starts collapsed.
        setTagsDrawerOpen(false);
      }
    }, [budgetId, load, loadFolders]),
  );

  // Date grouping walks every transaction of the budget, so it is memoized on
  // the list identity — screen-local toggles (privacy, collapsed sections,
  // measured card height) no longer rebuild it. Hooks must run unconditionally,
  // hence their position above the loading/error returns.
  const groups = useMemo(() => groupByDate(transactions), [transactions]);
  const tagById = useMemo(
    () => new Map(tagSummaries.map((entry) => [entry.tag.id, entry.tag])),
    [tagSummaries],
  );

  const handleEditTransaction = useCallback(
    (entry) =>
      router.push({
        pathname: '/transaction/form',
        params: { budgetId, transactionId: entry.id },
      }),
    [budgetId],
  );

  const confirmDeleteTransaction = useCallback(
    (transaction) => {
      Alert.alert(
        'Delete transaction?',
        transaction.description || 'This entry will be removed from the budget.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: () => removeTransaction(transaction.id) },
        ],
      );
    },
    [removeTransaction],
  );

  // The route ID is the identity of this screen. Until the store has data for
  // exactly that ID, the previous budget's values must never render.
  const isCurrentBudget = Boolean(budget) && storeBudgetId === budgetId && budget.id === budgetId;

  // A failed read is not proof the folder is gone. Offer a retry instead of
  // the "not found" dead-end, and make clear the data itself is intact.
  if (loadError && storeBudgetId === budgetId) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ title: 'Couldn’t load budget' }} />
        <EmptyState
          icon="folder"
          title="Couldn’t load this budget"
          description="Budgetarian couldn’t read this folder from local storage. Your data is still on this device — try again."
        >
          <View style={{ alignItems: 'center', gap: spacing.sm }}>
            <Button label="Try again" icon="refresh" onPress={() => load(budgetId)} />
            <Button label="Back to Budgets" icon="wallet" onPress={() => router.replace('/budgets')} />
          </View>
        </EmptyState>
      </View>
    );
  }

  if (error && storeBudgetId === budgetId) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ title: 'Budget not found' }} />
        <EmptyState
          icon="folder"
          title="Budget not found"
          description={error?.message ?? 'This budget may have been deleted.'}
        >
          <Button label="Back to Budgets" icon="wallet" onPress={() => router.replace('/budgets')} />
        </EmptyState>
      </View>
    );
  }

  if (!isCurrentBudget) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ title: 'Budget…' }} />
        <ActivityIndicator color={colors.primary} size="large" />
        <Text variant="body" tone="muted" style={{ marginTop: spacing.md }}>
          Opening budget…
        </Text>
      </View>
    );
  }

  const activeTag = tagSummaries.find((entry) => entry.tag.id === activeTagId)?.tag ?? null;

  // Share of income already spent, from the same summary the stats row uses.
  // Income of zero means nothing to measure against → 0%, never a divide-by-zero.
  // The label may exceed 100% when expenses outrun income; the fill is clamped.
  const spentPercent = summary.income > 0 ? (summary.expense / summary.income) * 100 : 0;
  const spentFill = Math.min(100, Math.max(0, spentPercent));
  const fillColor = spendColor(colors, spentPercent);
  const folderCard = isHexColor(budget.color) ? resolveFolderPalette(budget.color, colors) : null;
  const folderInk = folderCard ? folderCard.folderInk : null;
  // The budget folder this budget currently sits in. Display lookup only:
  // folders organize budgets in the Budgets tab and hold no money themselves.
  const budgetFolder = folders.find((folder) => folder.id === budget.folder_id) ?? null;

  // Same archive operation as the Budgets tab's selection-mode Remove: `archiveMany`
  // flips only `deleted_at`, so the budget moves to Archive with its id,
  // transactions, breakdown items, tags, reminders, attachments, color and
  // folder assignment untouched, and Restore returns it losslessly.
  function confirmDeleteBudget() {
    if (!budget) return;
    Alert.alert(
      `Delete ${budget.name}?`,
      'This budget will be removed from your active lists and moved to Archive. Its financial data will be preserved, and you can restore it later from Archive.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          // Neutral, not destructive: archiving is reversible.
          style: 'default',
          onPress: async () => {
            try {
              await archiveMany([budget.id]);
              // One navigation action, not dismissAll()+replace() in the same
              // tick: two stack mutations per commit race with Fabric's
              // header-config updates and crash detached stack fragments on
              // Android (react-native-screens #4429).
              router.dismissTo('/budgets');
              showToast('1 budget archived', 'success');
            } catch (archiveError) {
              showToast(archiveError?.message ?? 'Could not archive this budget.', 'error');
            }
          },
        },
      ],
    );
  }

  return (
    // The route lives in the root stack (outside the tabs' gesture root), so
    // Android needs its own GestureHandlerRootView above any SwipeActionRow —
    // same per-screen pattern as app/folder/[id].jsx.
    <GestureHandlerRootView style={styles.fill}>
      <Stack.Screen
        options={{
          title: budget.name,
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Budget options"
              onPress={() =>
                Alert.alert(budget.name, null, [
                  {
                    text: 'Edit budget',
                    onPress: () =>
                      router.push({ pathname: '/budget/form', params: { id: budget.id } }),
                  },
                  // Neutral, not destructive: this archives the budget (reversible).
                  { text: 'Delete budget', onPress: confirmDeleteBudget },
                  { text: 'Cancel', style: 'cancel' },
                ])
              }
              hitSlop={10}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            >
              <Icon name="more" size={20} color={colors.text} />
            </Pressable>
          ),
        }}
      />

      {/* Pinned summary: floats over the scroll body like the transaction
          form's sticky Amount card — the transaction list scrolls beneath the
          card's opaque surface instead of clipping against a full-width band.
          box-none keeps the band's transparent padding and the area around
          the collapsed drawer touch-through, so the list below still scrolls
          and rows stay tappable. */}
      <View
        pointerEvents="box-none"
        style={[
          styles.pinned,
          {
            paddingHorizontal: spacing.lg,
            paddingBottom: spacing.md,
            paddingTop: spacing.md,
          },
        ]}
      >
        <Card
          onLayout={(e) => setCardHeight(e.nativeEvent.layout.height)}
          style={{
            ...(folderCard
              ? { backgroundColor: folderCard.folder, borderColor: folderCard.folderBorder }
              : null),
            // Mirror of the transaction form's sticky Amount card: a floating,
            // borderless, generously rounded surface with a soft drop shadow.
            // zIndex 2 keeps it in front of the tags drawer it hides.
            borderRadius: 25,
            borderWidth: 0,
            padding: spacing.md,
            boxShadow: `0 6px 16px ${colors.shadow}`,
            zIndex: 2,
          }}
        >
          {/* Fading texture: an ink wash that soaks into the surface from the
              top of the card, same SVG gradient pattern the transaction form
              uses for its tag-strip fades. It is the first child and carries
              no touches, so the figures below it stay crisp. */}
          <View pointerEvents="none" style={styles.fadeClip}>
            <Svg height="100%" width="100%">
              <Defs>
                <LinearGradient
                  id={`remaining-fade-${budgetId}`}
                  x1="0%"
                  x2="0%"
                  y1="0%"
                  y2="100%"
                >
                  <Stop offset="0" stopColor={folderInk ?? colors.primary} stopOpacity={0.16} />
                  <Stop offset="1" stopColor={folderInk ?? colors.primary} stopOpacity={0} />
                </LinearGradient>
              </Defs>
              <Rect
                x="0"
                y="0"
                width="100%"
                height="100%"
                fill={`url(#remaining-fade-${budgetId})`}
              />
            </Svg>
          </View>
          <SectionHeader
            title="Remaining"
            color={folderInk}
            style={{ marginBottom: spacing.xs }}
          />
          <View style={styles.remainingRow}>
            <Text
              variant="display"
              tone={summary.remaining < 0 ? 'expense' : 'default'}
              style={{
                fontSize: 40,
                letterSpacing: -0.8,
                // Let the figure yield to the eye button on very large amounts
                // instead of pushing it past the card's right edge.
                flexShrink: 1,
                ...(folderInk ? { color: folderInk } : null),
              }}
            >
              {remainingVisible
                ? formatCurrency(summary.remaining, { currency })
                : maskAmountText(formatCurrency(summary.remaining, { currency }))}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={remainingVisible ? 'Hide remaining amount' : 'Show remaining amount'}
              onPress={() => setRemainingVisible((visible) => !visible)}
              hitSlop={10}
              style={({ pressed }) => [
                styles.visibilityButton,
                { opacity: pressed ? 0.5 : 0.75 },
              ]}
            >
              <Icon
                name={remainingVisible ? 'eye' : 'eyeOff'}
                size={26}
                color={folderInk ?? colors.textMuted}
              />
            </Pressable>
          </View>
          <Text
            variant="caption"
            tone="muted"
            style={{
              marginTop: spacing.xs,
              ...(folderInk ? { color: folderInk } : null),
            }}
          >
            {formatDateRange(budget.start_date, budget.end_date)}
          </Text>
          {/* Quick move: which folder this budget lives in (or none), tap to
              change. Touch target stays comfortable even though the text is
              caption-sized. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={budgetFolder ? `Move out of folder ${budgetFolder.name}` : 'Add this budget to a folder'}
            onPress={() => setFolderPickerOpen(true)}
            hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
            style={({ pressed }) => [
              styles.folderRow,
              {
                marginTop: spacing.sm,
                opacity: pressed ? 0.6 : 1,
              },
            ]}
          >
            <Icon name="folder" size={16} color={folderInk ?? colors.textMuted} />
            <Text
              variant="caption"
              tone="muted"
              numberOfLines={1}
              style={{ flexShrink: 1, ...(folderInk ? { color: folderInk } : null) }}
            >
              {budgetFolder ? `In “${budgetFolder.name}”` : 'Add to folder'}
            </Text>
            <Icon name="chevronRight" size={14} color={folderInk ?? colors.textMuted} />
          </Pressable>

          {/* Progress bar replaces the old stats separator: the fill shows how
              much of the budget's income has been spent (expense / income). */}
          <View
            style={[
              styles.progressTrack,
              {
                backgroundColor: folderCard ? folderCard.folderBorder : colors.surfaceMuted,
                marginTop: spacing.md,
              },
            ]}
          >
            <View
              style={[
                styles.progressFill,
                { backgroundColor: folderInk ?? fillColor, width: `${spentFill}%` },
              ]}
            />
          </View>

          <Text
            variant="caption"
            tone="muted"
            style={folderInk ? { marginTop: 6, color: folderInk } : { marginTop: 6 }}
          >
            {Math.round(spentPercent)}% of income spent
          </Text>

          <View style={[styles.stats, { marginTop: spacing.sm }]}>
            <Stat
              label="Income"
              value={formatCurrency(summary.income, { currency })}
              tone="income"
              style={{ marginRight: 14 }}
              labelColor={folderInk}
              valueColor={folderInk}
            />
            <View
              style={[
                styles.statDivider,
                { backgroundColor: folderInk ? `${folderInk}80` : colors.border },
              ]}
            />
            <Stat
              label="Expenses"
              value={formatCurrency(summary.expense, { currency })}
              tone="expense"
              style={{ marginLeft: 14, marginRight: 14 }}
              labelColor={folderInk}
              valueColor={folderInk}
            />
            <View
              style={[
                styles.statDivider,
                { backgroundColor: folderInk ? `${folderInk}80` : colors.border },
              ]}
            />
            <Stat
              label="Transactions"
              value={String(summary.transactionCount)}
              style={{ marginLeft: 14, marginRight: 0 }}
              labelColor={folderInk}
              valueColor={folderInk}
            />
          </View>
        </Card>

        <TagsDrawer
          activeTagId={activeTagId}
          currency={currency}
          onManageTags={() => router.push('/tags')}
          onSetActiveTag={setActiveTag}
          onToggle={() => setTagsDrawerOpen((value) => !value)}
          open={tagsDrawerOpen}
          tagSummaries={tagSummaries}
        />
      </View>

      {/* Reserve room for the floating add button: its own bottom offset plus
          the button height, so the last transaction row scrolls clear of it.
          The top padding clears the pinned card plus the collapsed drawer's
          visible handle strip, so transactions start below the peek. */}
      <Screen
        bottomSpace={FAB_SIZE + spacing.xl}
        contentContainerStyle={{
          paddingTop: spacing.md + cardHeight + DRAWER_PEEK + spacing.lg,
        }}
      >
        <SectionHeader
          title={`Transactions · ${transactions.length}`}
          fontSize={14}
          collapsed={!transactionsOpen}
          onToggle={() => setTransactionsOpen((open) => !open)}
          action={
            activeTag ? (
              <Text variant="caption" tone="muted">
                {activeTag.name}
              </Text>
            ) : null
          }
        />

        {transactionsOpen &&
          (transactions.length === 0 ? (
            <EmptyState
              icon="list"
              title={activeTag ? `No ${activeTag.name} transactions` : 'No transactions yet'}
              description={
                activeTag
                  ? 'Nothing has been recorded under this tag inside this budget.'
                  : 'Add income or expenses to this budget and they will show up here, grouped by day.'
              }
            >
              <Button label="Add transaction" icon="add" onPress={() => router.push({ pathname: '/transaction/form', params: { budgetId: budget.id } })} />
            </EmptyState>
          ) : (
            // Any touch inside the list region dismisses a stray open swipe row
            // (taps on the row itself are handled by its own close overlay).
            <View onTouchStart={closeAllSwipeActions}>
              {groups.map((group) => (
                <View key={group.date}>
                  <Text variant="label" tone="muted" style={{ marginBottom: spacing.sm, marginTop: spacing.sm }}>
                    {dayLabel(group.date)}
                  </Text>
                  <Card padded={false}>
                    {group.items.map((transaction, index) => (
                      <SwipeActionRow
                        key={transaction.id}
                        rowId={`budget-txn-${transaction.id}`}
                        actions={[
                          {
                            key: 'delete',
                            label: 'Delete',
                            icon: 'trash',
                            tone: 'destructive',
                            onPress: () => confirmDeleteTransaction(transaction),
                          },
                        ]}
                      >
                        <TransactionRow
                          transaction={transaction}
                          tag={tagById.get(transaction.tag_id) ?? null}
                          currency={currency}
                          sharePercent={transaction.sharePercent}
                          isFirst={index === 0}
                          isLast={index === group.items.length - 1}
                          onEdit={handleEditTransaction}
                        />
                      </SwipeActionRow>
                    ))}
                  </Card>
                </View>
              ))}
            </View>
          ))}
      </Screen>

      <Fab
        onPress={() =>
          router.push({
            pathname: '/transaction/form',
            params: { budgetId: budget.id, tagId: activeTagId ?? '' },
          })
        }
        accessibilityLabel="Add transaction"
      />

      {folderPickerOpen ? (
        <FolderPickerSheet
          folders={folders}
          onPick={async (pickedId) => {
            try {
              await moveToFolder(budget.id, pickedId);
              const destination = folders.find((folder) => folder.id === pickedId);
              showToast(destination ? `Moved to ${destination.name}` : 'Moved to the main list');
            } catch (moveError) {
              showToast(moveError?.message ?? 'Could not move the budget.', 'error');
            }
          }}
          onClose={() => setFolderPickerOpen(false)}
        />
      ) : null}
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  pinned: {
    // Lifted out of the column flow so the Screen's ScrollView fills the
    // whole scene and its content slides under the card instead of being
    // hard-clipped at the band's edge. zIndex keeps the card on top even
    // though it precedes the ScrollView in JSX order.
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 2,
  },
  centered: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 24 },
  // The tags drawer sits behind the Remaining card in the pinned band: the
  // card's zIndex 2 wins, so the drawer reads as sliding out from under it.
  tagsDrawer: { zIndex: 1 },
  // Shrinks when the Card's maxHeight caps the drawer so the grid ScrollView
  // gives up height, never the fixed-height handle strip at the bottom edge.
  drawerBody: { flexShrink: 1 },
  drawerHandle: {
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 6,
    height: DRAWER_PEEK,
    justifyContent: 'center',
  },
  // Remaining amount with its privacy toggle: the figure keeps the left edge
  // and the eye button sits flush with the card's right edge, optically
  // centered against the 40px display text.
  remainingRow: { alignItems: 'center', flexDirection: 'row', gap: 10, justifyContent: 'space-between' },
  // Clips the fade wash to the Remaining card's 25px corners.
  fadeClip: {
    borderRadius: 25,
    bottom: 0,
    left: 0,
    overflow: 'hidden',
    position: 'absolute',
    right: 0,
    top: 0,
  },
  visibilityButton: { marginRight: 30, padding: 2 },
  // Folder quick-move row under the date caption: icon, label, chevron.
  folderRow: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  stats: { flexDirection: 'row' },
  // Centered rule between the Income / Expenses / Transactions stats. It is
  // deliberately shorter than the stat block (not a full-height gridline)
  // and sits in even gutters: each neighbouring Stat reserves 14px of margin
  // on the side facing the rule.
  statDivider: {
    alignSelf: 'center',
    height: 38,
    width: 1.5,
  },
  progressTrack: { borderRadius: 4, height: 8, overflow: 'hidden', width: '100%' },
  progressFill: { borderRadius: 4, height: '100%' },
  // Keep both axes evenly spaced and stop wrapped rows from stretching cards
  // to fill leftover vertical space. Dynamic `gap` above supplies the theme's
  // small spacing value.
  tagGrid: {
    alignContent: 'flex-start',
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  tagGridItem: { flexGrow: 0, flexShrink: 0, width: '48%' },
  // No fixed cap anymore: the drawer's measured maxHeight (three real grid
  // rows plus chrome) bounds it, and flexShrink trims the viewport when the
  // Remaining card clamps the drawer. Keeps the grid scrolling independently
  // inside the drawer.
  tagScroll: { flexGrow: 0, flexShrink: 1 },
});