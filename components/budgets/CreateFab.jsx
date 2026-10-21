import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import { useTheme } from '../ui/ThemeProvider';

/** Diameter of the create button; the host screen pads its content by this. */
export const CREATE_FAB_SIZE = 56;

const MENU_H = 48; // create-menu pill height (comfortable Android touch target)
const MENU_MS = 220; // menu expand/collapse duration

/**
 * One expanded create action: a floating pill with icon + label that rises
 * into place as the menu opens. `open` is the shared 0→1 value driving the
 * whole menu, so every item animates from the same clock with a small
 * per-index travel offset for a staggered, polished feel.
 */
function CreateMenuItem({ animatedOpen, colors, index, icon, label, onPress, radius }) {
  const itemStyle = useAnimatedStyle(() => ({
    opacity: animatedOpen.value,
    transform: [
      { translateY: (1 - animatedOpen.value) * (10 + index * 8) },
      { scale: 0.9 + 0.1 * animatedOpen.value },
    ],
  }));

  return (
    <Animated.View
      style={[
        styles.menuItemWrap,
        {
          backgroundColor: colors.surfaceElevated,
          borderColor: colors.border,
          borderRadius: radius.pill,
          boxShadow: `0 4px 14px ${colors.shadow}`,
        },
        itemStyle,
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        style={({ pressed }) => [styles.menuItem, { opacity: pressed ? 0.7 : 1 }]}
      >
        <Icon name={icon} size={20} color={colors.primary} />
        <Text variant="body" style={styles.menuLabel}>
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

/**
 * The Budgets screen's create action: the app's one create menu (New Folder,
 * New Budget) docked to a centered floating button above the bottom navigation
 * — the same menu the tab bar used to carry, moved next to the folders and
 * budgets it creates. Both items still push the existing /folder/form and
 * /budget/form routes, and the menu always restores to its collapsed state
 * before navigating.
 *
 * It is rendered as a sibling of <Screen/> inside the scrolling area's flex:1
 * View, so it floats over the list — anchored above any in-flow bottom strip
 * (the pinned folders) without measuring it — and the screen reserves
 * `CREATE_FAB_SIZE` of content padding so the last row scrolls clear of it.
 */
export function CreateFab({ bottomOffset = 0 }) {
  const { colors, radius, spacing } = useTheme();
  const reduced = useReducedMotion();
  const [expanded, setExpanded] = useState(false);
  const open = useSharedValue(0);
  const pushingRef = useRef(false);

  // The shared 0→1 value follows `expanded` through one effect (same pattern
  // as the tab bar's focus values), so no callback ever mutates a hook value.
  useEffect(() => {
    open.value = withTiming(expanded ? 1 : 0, { duration: reduced ? 0 : MENU_MS });
  }, [expanded, reduced, open]);

  // Android hardware back: while the menu is open, the first press only
  // collapses it — the app never navigates away by surprise.
  useEffect(() => {
    if (!expanded) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setExpanded(false);
      return true;
    });
    return () => subscription.remove();
  }, [expanded]);

  // Leaving the tab dismisses the menu first, so it never lingers over the
  // next screen.
  useFocusEffect(
    useCallback(() => () => setExpanded(false), []),
  );

  // Collapse, then push the form exactly once even on a double tap.
  const pushForm = useCallback((pathname) => {
    if (pushingRef.current) return;
    pushingRef.current = true;
    setExpanded(false);
    router.push({ pathname });
    setTimeout(() => {
      pushingRef.current = false;
    }, 700);
  }, []);

  return (
    <View pointerEvents="box-none" style={[styles.layer, { bottom: bottomOffset }]}>
      {expanded ? (
        // Tap-catcher rendered BEFORE the button, so it swallows taps anywhere
        // on the screen above the button while the button stays reachable. It
        // is deliberately not a focus stop: screen-reader users close the menu
        // with the button itself, which is labelled "Close create menu" when
        // open.
        <Pressable
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no"
          aria-hidden
          onPress={() => setExpanded(false)}
          style={styles.backdrop}
        />
      ) : null}

      <View pointerEvents="box-none" style={[styles.dock, { bottom: spacing.lg }]}>
        {/* The create menu: a compact column of labeled pills rising from the
            button. Hidden (not mounted-away) so it can animate both ways; only
            interactive while the menu is actually open. */}
        <View
          pointerEvents={expanded ? 'auto' : 'none'}
          // Collapsed items only fade out visually, so keep them out of the
          // screen-reader tree as well — otherwise TalkBack/VoiceOver can still
          // focus "New Folder" and "New Budget" while they are invisible.
          accessibilityElementsHidden={!expanded}
          importantForAccessibility={expanded ? 'auto' : 'no-hide-descendants'}
          aria-hidden={!expanded}
          style={[styles.menu, { bottom: CREATE_FAB_SIZE + spacing.sm, gap: spacing.sm }]}
        >
          <CreateMenuItem
            animatedOpen={open}
            colors={colors}
            icon="folderPlus"
            index={0}
            label="New Folder"
            onPress={() => pushForm('/folder/form')}
            radius={radius}
          />
          <CreateMenuItem
            animatedOpen={open}
            colors={colors}
            icon="wallet"
            index={1}
            label="New Budget"
            onPress={() => pushForm('/budget/form')}
            radius={radius}
          />
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Close create menu' : 'Create new folder or budget'}
          accessibilityState={{ expanded }}
          onPress={() => setExpanded((value) => !value)}
          hitSlop={8}
          style={({ pressed }) => [
            styles.button,
            {
              backgroundColor: colors.primary,
              boxShadow: `0 6px 16px ${colors.shadow}`,
              transform: [{ scale: pressed ? 0.94 : 1 }],
            },
          ]}
        >
          <Icon name={expanded ? 'close' : 'add'} size={26} color={colors.onPrimary} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    // Anchored to the host's scrolling area, so it sits above whatever in-flow
    // strip (pinned folders, selection toolbar) is docked below the list.
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  backdrop: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  dock: {
    alignItems: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
  },
  button: {
    alignItems: 'center',
    borderRadius: CREATE_FAB_SIZE / 2,
    height: CREATE_FAB_SIZE,
    justifyContent: 'center',
    width: CREATE_FAB_SIZE,
  },
  menu: {
    alignItems: 'center',
    alignSelf: 'center',
    flexDirection: 'column',
    position: 'absolute',
  },
  menuItemWrap: {
    borderWidth: 1,
    height: MENU_H,
  },
  menuItem: {
    alignItems: 'center',
    flexDirection: 'row',
    flexGrow: 1,
    gap: 8,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  menuLabel: {
    // Manrope's static weights carry the weight in the font file; no
    // synthetic bold.
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 15,
  },
});
