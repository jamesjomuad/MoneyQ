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

import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import { useTheme } from '../ui/ThemeProvider';

/**
 * Floating capsule navigation.
 *
 * The capsule is one surface: a theme background, one soft shadow, no border.
 * The tabs are icon-only: one glyph size, one shared icon zone, no visible
 * label, so the four tabs read as a single row of evenly spaced glyphs. The
 * tabs share the capsule's width equally and every glyph centers in its own
 * equal share; the destination still travels through `accessibilityLabel`.
 *
 * The center action stays a raised circle, docked just above the capsule's top
 * edge, in a slot wide enough that no tab can sit under it. It opens a create
 * menu: two labeled pills rise from the circle (New Folder, New Budget), and
 * tapping the circle again, the backdrop, or Android's back button collapses
 * the menu first. Both actions reuse the existing /folder/form and
 * /budget/form routes; the menu always restores to its collapsed state before
 * navigating.
 *
 * The active tab background is a single gliding pill shared by all tabs: it
 * glides (400 ms on the approved demo's cubic-bezier(0.22, 1, 0.36, 1)) to
 * whichever tab `state.index` points at, while the icon itself settles a
 * fraction larger. Tabs report their layout once; the pill follows the
 * navigation state, so programmatic tab changes animate identically.
 */

const BAR_H = 68; // capsule height (excludes the safe-area spacing below it)
const BAR_PAD = 8; // horizontal padding inside the capsule
const ICON_SIZE = 26; // the one glyph size, active or not
const ZONE_W = 48; // shared icon zone width: the pill is measured against it
const ZONE_H = 34; // shared icon zone height

/**
 * The single shared gliding pill. Sized from the icon zone it tracks — the
 * zone plus a hair of horizontal air and a little vertical, so it wraps the
 * glyph with even air on all sides.
 */
const PILL_W = ZONE_W + 2;
const PILL_H = ZONE_H + 6;
const PILL_TRAVEL_MS = 400; // pill glide duration between tabs
const ICON_SCALE_MS = 260; // active-icon settle, same curve as the pill
// cubic-bezier(0.22, 1, 0.36, 1) from the demo: a quick, soft settle.
const GLIDE_EASING = Easing.bezier(0.22, 1, 0.36, 1);

const FAB_GREEN = 50; // green action diameter
const FAB_RING = 3; // surface ring that separates it from the capsule
const FAB_OUTER = FAB_GREEN + FAB_RING * 2; // total touch diameter
const FAB_OVERHANG = 22; // how far the action rises above the capsule's top
const FAB_ICON = 28; // plus/close glyph inside the circle
const FAB_SLOT = FAB_OUTER + 14; // center slot: circle + clearance from tabs

const MENU_H = 48; // create-menu pill height (comfortable Android touch target)
const BAR_LIFT = 10; // extra air under the capsule, lifting the bar off the edge

/**
 * One tab: a single icon, centered in an equal share of the capsule — no visible
 * label, so the glyph owns the whole tab. The destination (and its screen-reader
 * name) still travel through `accessibilityLabel`. The active-state background is
 * NOT rendered here — a single shared pill in BottomTabBar glides between tabs and
 * sits behind whichever icon is active.
 *
 * This slot reports the ICON ZONE's layout, not the tab's, so the pill centers on
 * the exact zone the icon lives in no matter how the tab's height is distributed.
 * The slot also settles its own icon a fraction larger when focused (×1.04 over
 * 260 ms, no lift and no bounce); the color swap is a plain re-render. Every slot
 * shares the same fixed zone, so nothing shifts while the pill glides between
 * tabs.
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
    transform: [{ scale: 1 + 0.04 * focus.value }],
  }));

  const tabLayout = useRef(null);
  const zoneLayout = useRef(null);

  // Report the icon zone's position in capsule coordinates: zone offset within
  // the tab + tab offset within the capsule. Either layout event re-reports the
  // pair, so a re-measure (rotation, font change) keeps the pill's target exact.
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
  // selected. Each TabButton reports its ICON ZONE's position in capsule
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
    // up to capsule coordinates) fully decide it, so the first and last tabs
    // align like every other one — even though the raised center slot makes the
    // columns unequal. No padding or glyph assumptions.
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
      return; // x unchanged (a re-measure moved only `top`) — no travel
    }
    // Glide horizontally on the demo's curve. Only the pill moves — the icons
    // stay put, so the bar never reflows mid-transition.
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

  // Air held under the capsule: the Android navigation inset (or a minimum of
  // breathing room) plus the small lift that keeps the bar off the screen edge.
  const barInset = Math.max(insets.bottom, spacing.md) + BAR_LIFT;
  // Distance from the band's bottom edge to the capsule's top, and to the
  // crest of the raised circle — the menu stacks above the latter and stays
  // clear of the Android navigation inset below the capsule.
  const cardTop = barInset + BAR_H;
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
          // Keep the capsule clear of the screen edges, clear of the Android
          // system navigation area, and lifted the extra hair off the bottom.
          paddingBottom: barInset,
          paddingHorizontal: spacing.lg,
        },
      ]}
    >
      {expanded ? (
        // Tap-catcher rendered BEFORE the capsule, so it swallows taps anywhere
        // on the scene above the bar while the capsule (and the center toggle)
        // stay reachable on top of it.
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss create menu"
          onPress={() => setExpanded(false)}
          style={[styles.backdrop, { bottom: cardTop }]}
        />
      ) : null}

      <View style={styles.cardWrap}>
        {/* One surface: the capsule carries the background and the shadow
            itself, so there is no second layer behind it to read as a band. */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              borderRadius: BAR_H / 2,
              boxShadow: `0 6px 18px ${colors.shadow}`,
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
                borderRadius: radius.md,
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

          {/* Docked over the capsule's top edge. The surface ring keeps the
              green circle visually separate without notching or distorting the
              capsule. It toggles the create menu and shows a close glyph while
              open. */}
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
                  { scale: pressed ? 0.96 : 1 },
                ],
                width: FAB_OUTER,
              },
            ]}
          >
            <View
              style={{
                ...styles.fabRing,
                pointerEvents: 'none',
                backgroundColor: colors.surface,
                borderRadius: FAB_OUTER / 2,
              }}
            />
            <View
              style={{
                ...styles.fabCore,
                backgroundColor: colors.primary,
                borderRadius: FAB_GREEN / 2,
                boxShadow: `0 3px 8px ${colors.shadow}`,
              }}
            >
              <Icon name={expanded ? 'close' : 'add'} size={FAB_ICON} color={colors.onPrimary} />
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
    height: BAR_H,
    justifyContent: 'center',
    width: '100%',
  },
  card: {
    alignItems: 'center',
    flexDirection: 'row',
    height: BAR_H,
    overflow: 'visible',
    paddingHorizontal: BAR_PAD,
    width: '100%',
  },
  tab: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  iconWrap: {
    alignItems: 'center',
    // The zone the pill is measured against; the taller tab centers this zone
    // on both axes, so the glyph carries even air on all sides.
    height: ZONE_H,
    justifyContent: 'center',
    width: ZONE_W,
  },
  pill: {
    // Anchored at the capsule's origin; top/translateX in the animated style
    // steer it to the active tab's measured icon zone.
    height: PILL_H,
    left: 0,
    position: 'absolute',
    top: 0,
    width: PILL_W,
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
