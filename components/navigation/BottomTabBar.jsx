import { useEffect } from 'react';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
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
 * Floating rounded card navigation.
 *
 * A pill-shaped capsule sits inside a padded band, so it floats clear of the
 * screen edges and never covers scrollable content. The card uses surface +
 * a subtle 1 px border + a soft shadow, all from theme tokens, so it reads
 * premium in light, dark and the MoneyQ navy palette.
 *
 * The shadow and the border live on two separate stacked layers. Android
 * derives an elevated view's shadow from its outline; when that same view also
 * has a 1 px border, the outline falls back to the unrounded border box and
 * the shadow renders as a straight line under the card. Keeping `elevation` on
 * a borderless surface pill behind the bordered card removes that artifact.
 *
 * The center action keeps its original purpose (create budget) and stays
 * centered and elevated, docked over the capsule's top edge with a thin surface
 * ring, so it reads deliberately integrated rather than floating loose.
 */

const CARD_H = 74; // capsule height (excludes the safe-area spacing below it)
const CARD_PAD = 8; // horizontal padding inside the capsule
const ICON_SIZE = 24;
const LABEL_SIZE = 11;
const INDICATOR_W = 56; // active pill width behind the icon
const INDICATOR_H = 30; // active pill height (and true pill radius = H / 2)

const FAB_GREEN = 54; // green action diameter
const FAB_RING = 3; // surface ring that separates it from the card
const FAB_OUTER = FAB_GREEN + FAB_RING * 2; // total touch diameter
const FAB_OVERHANG = 26; // how far the action rises above the card's top edge
const FAB_SLOT = FAB_OUTER + 16; // center slot: action + clearance from tabs

/**
 * One tab: icon inside a soft pill, short label below. Only the indicator pill
 * animates (opacity + slight scale, 180 ms); the color swap is a plain
 * re-render, so nothing animates per-frame for every tab. Every slot shares the
 * same fixed heights, so all icons center and all labels sit on one baseline.
 */
function TabButton({ descriptor, route, focused, navigate }) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const options = descriptor?.options ?? route.options ?? {};
  const label = options.tabBarLabel ?? options.title ?? route.name;

  const focus = useSharedValue(focused ? 1 : 0);
  useEffect(() => {
    focus.value = withTiming(focused ? 1 : 0, { duration: reduced ? 0 : 180 });
  }, [focused, reduced, focus]);

  const indicatorStyle = useAnimatedStyle(() => ({
    opacity: 0.5 + 0.5 * focus.value,
    transform: [{ scale: 0.9 + 0.1 * focus.value }],
  }));

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: focused }}
      onPress={() => {
        if (!focused) navigate(route.name);
      }}
      style={({ pressed }) => [styles.tab, { opacity: pressed ? 0.7 : 1 }]}
    >
      <View style={styles.iconWrap}>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.indicator,
            {
              backgroundColor: colors.primarySoft,
              borderRadius: INDICATOR_H / 2,
            },
            indicatorStyle,
          ]}
        />
        {options.tabBarIcon?.({
          focused,
          color: focused ? colors.primary : colors.textMuted,
          size: ICON_SIZE,
        })}
      </View>
      <Text
        variant="caption"
        tone={focused ? 'primary' : 'muted'}
        numberOfLines={1}
        style={{
          fontSize: LABEL_SIZE,
          fontWeight: focused ? '600' : '500',
          marginTop: 3,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function BottomTabBar({ state, descriptors, navigation }) {
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();

  const routes = state.routes;
  const middle = Math.ceil(routes.length / 2);
  const navigate = navigation.navigate;

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.band,
        {
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
      <View style={styles.cardWrap}>
        {/* Borderless surface pill that casts the shadow; the bordered card
            sits on top of it so Android never sees border + elevation at once. */}
        <View
          pointerEvents="none"
          style={[
            styles.cardShadow,
            {
              backgroundColor: colors.surface,
              borderRadius: CARD_H / 2,
              shadowColor: colors.shadow,
            },
          ]}
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
          {routes.slice(0, middle).map((route, i) => (
            <TabButton
              key={route.key}
              descriptor={descriptors[route.key]}
              focused={state.index === i}
              navigate={navigate}
              route={route}
            />
          ))}

          {/* Center slot reserves the action's width plus clearance, so no tab
              can sit under or crowd the raised button. */}
          <View
            accessibilityElementsHidden
            importantForAccessibility="no"
            pointerEvents="none"
            style={{ width: FAB_SLOT }}
          />

          {routes.slice(middle).map((route, i) => {
            const index = i + middle;
            return (
              <TabButton
                key={route.key}
                descriptor={descriptors[route.key]}
                focused={state.index === index}
                navigate={navigate}
                route={route}
              />
            );
          })}

          {/* Docked over the card's top edge. The surface ring keeps the green
              circle visually separate without notching or distorting the pill. */}
          <Pressable
            accessibilityLabel="Create budget"
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => router.push('/budget/form')}
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
              pointerEvents="none"
              style={[
                styles.fabRing,
                {
                  backgroundColor: colors.surface,
                  borderRadius: FAB_OUTER / 2,
                },
              ]}
            />
            <View
              style={[
                styles.fabCore,
                {
                  backgroundColor: colors.primary,
                  borderRadius: FAB_GREEN / 2,
                  shadowColor: colors.shadow,
                },
              ]}
            >
              <Icon name="add" size={26} color={colors.onPrimary} />
            </View>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  band: {
    width: '100%',
  },
  cardWrap: {
    height: CARD_H,
    justifyContent: 'center',
    width: '100%',
  },
  cardShadow: {
    ...StyleSheet.absoluteFillObject,
    elevation: 6,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
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
    paddingVertical: 4,
  },
  iconWrap: {
    alignItems: 'center',
    height: INDICATOR_H,
    justifyContent: 'center',
    width: INDICATOR_W,
  },
  indicator: {
    ...StyleSheet.absoluteFillObject,
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
    elevation: 6,
    height: FAB_GREEN,
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    width: FAB_GREEN,
  },
});
