import { useCallback } from 'react';
import { useIsFocused } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';

const SWIPE_ACTIVATION = 55;
const SWIPE_MIN_DISTANCE = 100;
const SWIPE_MIN_VELOCITY = 750;
const SHORT_SWIPE_DISTANCE = 55;
const EDGE_IGNORE = 28;
const VERTICAL_IGNORE = 20;

/**
 * Horizontal tab navigation boundary.
 *
 * The detector is mounted by the tab layout's `screenLayout`, so it covers the
 * selected tab scene without wrapping the stack, modals, or bottom-bar controls.
 * The hit-slop exclusion keeps Android gesture navigation and iOS edge-back
 * swipes free; vertical and short movements are ignored before navigation.
 */
export function TabSwipeArea({ children, navigation }) {
  const focused = useIsFocused();

  const navigateByOffset = useCallback(
    (offset) => {
      if (!focused) return;

      const state = navigation.getState();
      const targetIndex = state.index + offset;

      // Adjacent tabs only; the first and last never wrap.
      if (targetIndex < 0 || targetIndex >= state.routes.length) return;

      navigation.navigate(state.routes[targetIndex].name);
    },
    [focused, navigation],
  );

  const gesture = Gesture.Pan()
    .enabled(focused)
    .maxPointers(1)
    .hitSlop({ left: -EDGE_IGNORE, right: -EDGE_IGNORE, top: 0, bottom: 0 })
    .activeOffsetX([-SWIPE_ACTIVATION, SWIPE_ACTIVATION])
    .failOffsetY([-VERTICAL_IGNORE, VERTICAL_IGNORE])
    .onEnd((event) => {
      if (!focused) return;

      const { translationX, velocityX } = event;
      const swipeRight =
        translationX > SWIPE_MIN_DISTANCE ||
        (translationX > SHORT_SWIPE_DISTANCE && velocityX > SWIPE_MIN_VELOCITY);
      const swipeLeft =
        translationX < -SWIPE_MIN_DISTANCE ||
        (translationX < -SHORT_SWIPE_DISTANCE && velocityX < -SWIPE_MIN_VELOCITY);

      if (swipeRight) runOnJS(navigateByOffset)(-1);
      else if (swipeLeft) runOnJS(navigateByOffset)(1);
    });

  return (
    <GestureHandlerRootView style={styles.root}>
      <GestureDetector gesture={gesture}>
        <View collapsable={false} style={styles.scene}>
          {children}
        </View>
      </GestureDetector>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scene: {
    flex: 1,
  },
});
