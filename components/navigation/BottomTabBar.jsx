import { useCallback, useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { BackHandler, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { hexToRgb } from '../../utils/colors';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import { useTheme } from '../ui/ThemeProvider';

/**
 * Floating rounded card navigation.
 *
 * A pill-shaped capsule sits inside a padded band, so it floats clear of the
 * screen edges and never covers scrollable content. The card uses surface +
 * a subtle 1 px border + a soft shadow, all from theme tokens, so it reads
 * premium in light, dark and the Budgetarian navy palette.
 *
 * The shadow and the border live on two separate stacked layers: a
 * borderless surface pill carries the boxShadow, and the bordered card sits
 * on top of it. This keeps the rounded shadow crisp on every platform.
 *
 * The center action is a create menu: tapping it expands two labeled pills —
 * New Folder and New Budget — up from the raised circle, and tapping it again,
 * the backdrop, or Android's back button collapses the menu first. Both
 * actions reuse the existing /folder/form and /budget/form routes; the menu
 * always restores to its collapsed state before navigating.
 *
 * The active tab background is a single gliding pill shared by all tabs: it
 * glides (400 ms on the approved demo's cubic-bezier(0.22, 1, 0.36, 1)) to
 * whichever tab `state.index` points at, while the icon itself lifts and
 * gently scales. Tabs report their layout once; the pill follows the
 * navigation state, so programmatic tab changes animate identically.
 */

const CARD_H = 74; // capsule height (excludes the safe-area spacing below it)
const CARD_PAD = 8; // horizontal padding inside the capsule
const ICON_SIZE = 24; // regular glyph; the active tab lifts it and scales ×1.06
const LABEL_SIZE = 11;
const ZONE_W = 56; // shared icon + label container width: fixed, so a long
//                   label can never stretch a tab; it truncates instead
const ZONE_H = 34; // icon container height: the pill is measured against this
const TAB_PAD_V = 4; // tab vertical padding (icon zone position is measured,
//                    never inferred from this)

// The single shared gliding pill. Sized from the icon container it tracks —
// the approved demo's pill look at this scale: the container's width with a
// little vertical air, so it wraps the glyph without ever reaching the label.
const PILL_W = ZONE_W;
const PILL_H = ZONE_H + 8;
const PILL_RADIUS = 16; // rounded rect (the demo's 18 at its larger column size)
const PILL_TRAVEL_MS = 400; // pill glide duration between tabs (350–420 target)
const ICON_SCALE_MS = 300; // active-icon settle, same curve as the pill
// cubic-bezier(0.22, 1, 0.36, 1) from the demo: a quick, soft settle.
const GLIDE_EASING = Easing.bezier(0.22, 1, 0.36, 1);

const FAB_GREEN = 54; // green action diameter
const FAB_RING = 3; // surface ring that separates it from the card
const FAB_OUTER = FAB_GREEN + FAB_RING * 2; // total touch diameter
const FAB_OVERHANG = 26; // how far the action rises above the card's top edge
const FAB_SLOT = FAB_OUTER + 16; // center slot: action + clearance from tabs

const MENU_H = 48; // create-menu pill height (comfortable Android touch target)

/** `#RRGGBB` + alpha → `rgba(r, g, b, alpha)`; returns the input if not a hex. */
function withAlpha(hex, alpha) {
  const rgb = hexToRgb(hex);
  return rgb ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})` : hex;
}

/**
 * One tab: a prominent icon over a short label, inside a fixed-size slot.
 * The active-state background is NOT rendered here — a single shared pill in
 * BottomTabBar glides between tabs and sits behind whichever icon is active.
 * This slot reports the ICON ZONE's layout, not the tab's: the tab's total
 * height depends on the label (which reflows when fonts load or weights
 * change), so inferring the icon's position from it drifts. Instead both the
 * tab (relative to the card) and the icon zone (relative to the tab) are
 * measured, and their offsets are summed — the pill then centers on the exact
 * zone the icon lives in, never on the label. The slot also lifts and gently
 * scales its own icon when focused (×1.06 over 300 ms); the color swap is a
 * plain re-render. Every slot shares the same fixed sizes, so nothing shifts
 * while the pill glides between tabs.
 */
function TabButton({ descriptor, route, focused, navigate, onMeasure }) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const options = descriptor?.options ?? route.options ?? {};
  const label = options.tabBarLabel ?? options.title ?? route.name;

  const focus = useSharedValue(focused ? 1 : 0);
  useEffect(() => {
    focus.value = withTiming(focused ? 1 : 0, {
      duration: reduced ? 0 : ICON_SCALE_MS,
      easing: GLIDE_EASING,
    });
  }, [focused, reduced, focus]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: -1 * focus.value },
      { scale: 1 + 0.06 * focus.value },
    ],
  }));

  const tabLayout = useRef(null);
  const zoneLayout = useRef(null);

  // Report the icon zone's position in CARD coordinates: zone offset within
  // the tab + tab offset within the card. Either layout event re-reports the
  // pair, so late label reflows (font loads) keep the pill's target exact.
  const reportZone = useCallback(() => {
    if (!tabLayout.current || !zoneLayout.current) return;
    onMeasure(route.key, {
      height: zoneLayout.current.height,
      width: zoneLayout.current.width,
      x: tabLayout.current.x + zoneLayout.current.x,
      y: tabLayout.current.y + zoneLayout.current.y,
    });
  }, [onMeasure, route.key]);

  const handleTabLayout = useCallback(
    (event) => {
      tabLayout.current = event.nativeEvent.layout;
      reportZone();
    },
    [reportZone],
  );

  const handleZoneLayout = useCallback(
    (event) => {
      zoneLayout.current = event.nativeEvent.layout;
      reportZone();
    },
    [reportZone],
  );

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: focused }}
      onLayout={handleTabLayout}
      onPress={() => {
        if (!focused) navigate(route.name);
      }}
      style={({ pressed }) => [styles.tab, { opacity: pressed ? 0.7 : 1 }]}
    >
      <View onLayout={handleZoneLayout} style={styles.iconWrap}>
        <Animated.View style={iconStyle}>
          {options.tabBarIcon?.({
            focused,
            color: focused ? colors.primary : colors.textMuted,
            size: ICON_SIZE,
          })}
        </Animated.View>
      </View>
      <Text
        variant="caption"
        tone={focused ? 'primary' : 'muted'}
        numberOfLines={1}
        style={[
          styles.label,
          {
            fontFamily: focused ? 'Manrope_600SemiBold' : 'Manrope_500Medium',
            fontSize: LABEL_SIZE,
          },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

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

export function BottomTabBar({ state, descriptors, navigation }) {
  const { colors, radius, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();

  const routes = state.routes;
  const middle = Math.ceil(routes.length / 2);
  const activeKey = routes[state.index]?.key;

  // The shared active pill: one Animated.View that glides to whichever tab is
  // selected. Each TabButton reports its ICON ZONE's position in card
  // coordinates into measuresRef; the effect below centers the pill on that
  // zone — including when the route changes from another screen, because it
  // follows `state.index`, not press callbacks. A rotation or width change
  // re-fires the tabs' onLayout, so a fresh measure re-centers the pill too.
  const measuresRef = useRef({});
  const placedRef = useRef(false);
  const [measuredTick, setMeasuredTick] = useState(0);
  const pillX = useSharedValue(0);
  const pillTop = useSharedValue(0);
  const pillVisible = useSharedValue(0);

  const handleMeasure = useCallback((key, layout) => {
    const prev = measuresRef.current[key];
    measuresRef.current[key] = layout;
    if (
      !prev ||
      prev.x !== layout.x ||
      prev.y !== layout.y ||
      prev.width !== layout.width ||
      prev.height !== layout.height
    ) {
      setMeasuredTick((tick) => tick + 1);
    }
  }, []);

  useEffect(() => {
    const zone = activeKey ? measuresRef.current[activeKey] : undefined;
    if (!zone) return;
    // Center the pill on the icon zone: the zone's own x/y/width/height (summed
    // up to card coordinates) fully decide it, so the first and last tabs align
    // like every other one — even though the raised center slot makes the
    // columns unequal. No padding or label assumptions.
    const left = zone.x + (zone.width - PILL_W) / 2;
    const top = zone.y + (zone.height - PILL_H) / 2;
    pillTop.value = top;
    if (!placedRef.current) {
      // First layout: snap into place unseen, then fade in.
      placedRef.current = true;
      pillX.value = left;
      pillVisible.value = withTiming(1, { duration: reduced ? 0 : 180 });
      return;
    }
    if (Math.abs(pillX.value - left) < 0.5) {
      return; // x unchanged (e.g., label reflow moved only `top`) — no travel
    }
    // Glide horizontally on the demo's curve. Only the pill moves — icons and
    // labels stay put, so the bar never reflows mid-transition.
    pillX.value = withTiming(left, {
      duration: reduced ? 0 : PILL_TRAVEL_MS,
      easing: GLIDE_EASING,
    });
  }, [activeKey, measuredTick, reduced, pillX, pillTop, pillVisible]);

  const pillStyle = useAnimatedStyle(() => ({
    opacity: pillVisible.value,
    top: pillTop.value,
    transform: [{ translateX: pillX.value }],
  }));

  const [expanded, setExpanded] = useState(false);
  const open = useSharedValue(0);
  const pushingRef = useRef(false);

  // The shared 0→1 value follows `expanded` through one effect (same pattern
  // as TabButton's focus value), so no callback ever mutates a hook value.
  useEffect(() => {
    open.value = withTiming(expanded ? 1 : 0, { duration: reduced ? 0 : 220 });
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

  // Any tab change dismisses the menu first, so it never lingers over a new
  // screen.
  const navigate = (name) => {
    setExpanded(false);
    navigation.navigate(name);
  };

  // Collapse, then push the form exactly once even on a double tap.
  const pushForm = (pathname) => {
    if (pushingRef.current) return;
    pushingRef.current = true;
    setExpanded(false);
    router.push({ pathname });
    setTimeout(() => {
      pushingRef.current = false;
    }, 700);
  };

  // Distance from the band's bottom edge to the card's top, and to the crest
  // of the raised circle — the menu stacks above the latter and stays clear
  // of the Android navigation inset below the capsule.
  const cardTop = Math.max(insets.bottom, spacing.md) + CARD_H;
  const menuBottom = cardTop + FAB_OVERHANG + spacing.sm;

  return (
    <View
      style={[
        styles.band,
        {
          pointerEvents: 'box-none',
          backgroundColor: colors.background,
          // Reserve the action's overhang plus a little air above the capsule.
          paddingTop: FAB_OVERHANG + spacing.xs,
          // Keep the capsule clear of the screen edges, and clear of the
          // Android system navigation area via the bottom inset.
          paddingBottom: Math.max(insets.bottom, spacing.md),
          paddingHorizontal: spacing.lg,
        },
      ]}
    >
      {expanded ? (
        // Tap-catcher rendered BEFORE the card, so it swallows taps anywhere
        // on the scene above the bar while the capsule (and the center
        // toggle) stay reachable on top of it.
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss create menu"
          onPress={() => setExpanded(false)}
          style={[styles.backdrop, { bottom: cardTop }]}
        />
      ) : null}

      <View style={styles.cardWrap}>
        {/* Borderless surface pill that casts the shadow; the bordered card
            sits on top of it so the shadow keeps its rounded outline. */}
        <View
          style={{
            ...styles.cardShadow,
            pointerEvents: 'none',
            backgroundColor: colors.surface,
            borderRadius: CARD_H / 2,
            boxShadow: `0 4px 16px ${colors.shadow}`,
          }}
        />

        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderRadius: CARD_H / 2,
            },
          ]}
        >
          {/* The single shared active pill. Rendered FIRST so every tab's
              icon paints on top of it; it never intercepts touches. */}
          <Animated.View
            accessibilityElementsHidden
            importantForAccessibility="no"
            pointerEvents="none"
            style={[
              styles.pill,
              {
                backgroundColor: colors.primarySoft,
                borderColor: withAlpha(colors.primary, 0.16),
              },
              pillStyle,
            ]}
          />

          {routes.slice(0, middle).map((route, i) => (
            <TabButton
              key={route.key}
              descriptor={descriptors[route.key]}
              focused={state.index === i}
              navigate={navigate}
              onMeasure={handleMeasure}
              route={route}
            />
          ))}

          {/* Center slot reserves the action's width plus clearance, so no tab
              can sit under or crowd the raised button. */}
          <View
            accessibilityElementsHidden
            importantForAccessibility="no"
            style={{ pointerEvents: 'none', width: FAB_SLOT }}
          />

          {routes.slice(middle).map((route, i) => {
            const index = i + middle;
            return (
              <TabButton
                key={route.key}
                descriptor={descriptors[route.key]}
                focused={state.index === index}
                navigate={navigate}
                onMeasure={handleMeasure}
                route={route}
              />
            );
          })}

          {/* Docked over the card's top edge. The surface ring keeps the green
              circle visually separate without notching or distorting the pill.
              It toggles the create menu and shows a close glyph while open. */}
          <Pressable
            accessibilityLabel={expanded ? 'Close create menu' : 'Create new folder or budget'}
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            hitSlop={8}
            onPress={() => setExpanded(!expanded)}
            style={({ pressed }) => [
              styles.fab,
              {
                height: FAB_OUTER,
                transform: [
                  { translateX: -FAB_OUTER / 2 },
                  { scale: pressed ? 0.94 : 1 },
                ],
                width: FAB_OUTER,
              },
            ]}
          >
            <View
              style={{ ...styles.fabRing, pointerEvents: 'none', backgroundColor: colors.surface, borderRadius: FAB_OUTER / 2 }}
            />
            <View
              style={{
                ...styles.fabCore,
                backgroundColor: colors.primary,
                borderRadius: FAB_GREEN / 2,
                boxShadow: `0 3px 8px ${colors.shadow}`,
              }}
            >
              <Icon name={expanded ? 'close' : 'add'} size={26} color={colors.onPrimary} />
            </View>
          </Pressable>
        </View>
      </View>

      {/* The create menu: compact column of labeled pills rising from the
          center button. Hidden (not mounted-away) so it can animate both
          ways; only interactive while the menu is actually open. */}
      <View
        pointerEvents={expanded ? 'auto' : 'none'}
        style={[styles.menu, { bottom: menuBottom, gap: spacing.sm }]}
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
    </View>
  );
}

const styles = StyleSheet.create({
  band: {
    width: '100%',
  },
  backdrop: {
    left: 0,
    position: 'absolute',
    right: 0,
    top: -10000,
  },
  cardWrap: {
    height: CARD_H,
    justifyContent: 'center',
    width: '100%',
  },
  cardShadow: {
    ...StyleSheet.absoluteFillObject,
  },
  card: {
    alignItems: 'center',
    borderWidth: 1,
    flexDirection: 'row',
    height: CARD_H,
    overflow: 'visible',
    paddingHorizontal: CARD_PAD,
    width: '100%',
  },
  tab: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingVertical: TAB_PAD_V,
  },
  iconWrap: {
    alignItems: 'center',
    // The zone the pill is measured against, so the wrapper never overhangs
    // into the label and the icon centers with even air on all sides.
    height: ZONE_H,
    justifyContent: 'center',
    width: ZONE_W,
  },
  pill: {
    // Anchored at the card's origin; top/translateX in the animated style
    // steer it to the active tab's measured icon zone. The 1 px border is the
    // demo's inset hairline, drawn inside so the pill's size never changes.
    borderWidth: 1,
    borderRadius: PILL_RADIUS,
    height: PILL_H,
    left: 0,
    position: 'absolute',
    top: 0,
    width: PILL_W,
  },
  label: {
    // Same fixed width as the icon container: labels center under the icon
    // and a long one truncates rather than stretching the tab.
    marginTop: 4,
    textAlign: 'center',
    width: ZONE_W,
  },
  fab: {
    alignItems: 'center',
    justifyContent: 'center',
    left: '50%',
    position: 'absolute',
    top: -FAB_OVERHANG,
  },
  fabRing: {
    ...StyleSheet.absoluteFillObject,
  },
  fabCore: {
    alignItems: 'center',
    height: FAB_GREEN,
    justifyContent: 'center',
    width: FAB_GREEN,
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
    gap: 10,
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  menuLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
});
