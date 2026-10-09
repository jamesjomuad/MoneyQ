import { useState } from 'react';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { Icon } from '../ui/Icon';
import { useTheme } from '../ui/ThemeProvider';

/**
 * Premium bottom bar for the four tabs plus a raised center action.
 *
 * The green top edge is one SVG path: straight along the bar, then a smooth
 * symmetric dip around the center button, so the line never hides behind the
 * circle or meets it with a hard corner. The path is stroked in `primary`, so
 * it follows whatever theme the user picked (deep green, light green, blue).
 *
 * The bar renders in normal flow (not absolutely positioned), so the tab
 * navigator keeps scene content above it automatically, and the extra
 * `insets.bottom` pad keeps it clear of Android's system navigation bar.
 */

const BAR_H = 64; // tappable row height, excluding the bottom safe-area pad
const EDGE_H = 44; // strip the notch lives in
const LINE = 1.25; // vertical center of the top line
const STROKE = 2.5;
const DIP_W = 56; // half-width of the notch around the center button
const DIP_D = 38; // how far the line dips below the bar's top edge
const CENTER_GAP = DIP_W * 2;
const RING = 54; // surface halo separating the button from the notch line
const BUTTON = 46; // primary fill of the action circle
const RING_CENTER_Y = 3; // button center relative to the bar's top edge

export function BottomTabBar({ state, descriptors, navigation }) {
  const { colors, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const [width, setWidth] = useState(0);

  const cx = width / 2;
  const notch =
    width > 0
      ? `M 0 ${LINE} H ${cx - DIP_W} C ${cx - 36} ${LINE}, ${cx - 22} ${LINE + DIP_D}, ${cx} ${LINE + DIP_D} C ${cx + 22} ${LINE + DIP_D}, ${cx + 36} ${LINE}, ${cx + DIP_W} ${LINE} H ${width}`
      : '';

  function TabButton({ route, index }) {
    const options = descriptors[route.key]?.options ?? route.options ?? {};
    const focused = state.index === index;
    const label = options.tabBarLabel ?? options.title ?? route.name;
    const icon = options.tabBarIcon?.({
      focused,
      color: focused ? colors.primary : colors.textMuted,
      size: 26,
    });

    return (
      <Pressable
        accessibilityRole="tab"
        accessibilityLabel={label}
        accessibilityState={{ selected: focused }}
        onPress={() => {
          if (!focused) navigation.navigate(route.name);
        }}
        style={({ pressed }) => [styles.tab, { opacity: pressed ? 0.65 : 1 }]}
      >
        <View
          style={[
            styles.indicator,
            {
              backgroundColor: focused ? colors.primarySoft : 'transparent',
              borderRadius: radius.pill,
            },
          ]}
        >
          {icon}
        </View>
      </Pressable>
    );
  }

  const routes = state.routes;
  const middle = Math.ceil(routes.length / 2);

  return (
    <View
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={[
        styles.bar,
        {
          backgroundColor: colors.surface,
          height: BAR_H + insets.bottom,
        },
      ]}
    >
      <View style={styles.row}>
        {routes.slice(0, middle).map((route, i) => (
          <TabButton key={route.key} route={route} index={i} />
        ))}
        {/* The center slot is exactly the notch, so tabs can't sit under it. */}
        <View style={{ width: CENTER_GAP }} accessibilityElementsHidden importantForAccessibility="no" />
        {routes.slice(middle).map((route, i) => (
          <TabButton key={route.key} route={route} index={i + middle} />
        ))}
      </View>

      <Svg
        width={Math.max(width, 1)}
        height={EDGE_H}
        style={styles.edge}
        pointerEvents="none"
        accessibilityElementsHidden
      >
        {width > 0 ? (
          <Path
            d={notch}
            stroke={colors.primary}
            strokeWidth={STROKE}
            fill="none"
            strokeLinecap="round"
          />
        ) : null}
      </Svg>

      {width > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Create budget"
          onPress={() => router.push('/budget/form')}
          style={({ pressed }) => [
            styles.action,
            {
              backgroundColor: colors.surface,
              borderRadius: RING / 2,
              height: RING,
              left: cx - RING / 2,
              shadowColor: colors.shadow,
              top: RING_CENTER_Y - RING / 2,
              transform: [{ scale: pressed ? 0.94 : 1 }],
              width: RING,
            },
          ]}
        >
          <View
            style={[
              styles.actionCore,
              {
                backgroundColor: colors.primary,
                borderRadius: BUTTON / 2,
              },
            ]}
          >
            <Icon name="add" size={24} color={colors.onPrimary} />
          </View>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    overflow: 'visible',
    width: '100%',
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    height: BAR_H,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  tab: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    minWidth: 44,
  },
  indicator: {
    alignItems: 'center',
    height: 40,
    justifyContent: 'center',
    width: 64,
  },
  edge: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  action: {
    alignItems: 'center',
    elevation: 6,
    justifyContent: 'center',
    position: 'absolute',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
  },
  actionCore: {
    alignItems: 'center',
    height: BUTTON,
    justifyContent: 'center',
    width: BUTTON,
  },
});
