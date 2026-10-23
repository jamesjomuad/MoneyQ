/**
 * First-launch introduction: five horizontally paged slides over everything
 * else in the app. Rendered as a full-screen overlay from the root layout
 * rather than a route — no redirect loops, no flashing, and the tabs never
 * mount underneath.
 *
 * UX ground rules this component follows: the tour is never a cage — Skip is
 * always in reach, a Back chevron appears from slide two onward, the progress
 * dots are buttons so a swipe is never the only way to move, and the page
 * counter says "N of 5" in words so position does not rest on color alone.
 * Slide content enters with short opacity/translate fades on the UI thread
 * (react-native-reanimated, the same pattern the budget lists use), and a
 * system-wide reduced-motion preference swaps the fades off entirely.
 */

import { router } from "expo-router";
import { useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import Animated, {
  FadeInDown,
  useReducedMotion,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useOnboardingStore } from "../../stores/onboardingStore";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Text } from "../ui/Text";
import { useTheme } from "../ui/ThemeProvider";

const SLIDES = [
  {
    icon: "wallet",
    title: "Welcome to <b>Budgetarian</b>",
    body: "Money management that lives entirely on your device. No accounts, no cloud, no sign-in — open it and go.",
  },
  {
    icon: "folder",
    title: "<b>Budgets</b>, grouped your way",
    body: "Each budget is one period of your money — October, a trip, a project. Folders collect budgets into any category you like, by year, purpose, or anything else.",
  },
  {
    icon: "bills",
    body: "Photograph a receipt or pick one from the gallery, and on-device text recognition offers every line as chips you can drop into the amount, date, or description. Nothing is ever filled in without you tapping it.",
    title: "<b>Receipts</b> you can photograph",
  },
  {
    icon: "clock",
    title: "Reminders that answer back",
    body: "Schedule a reminder on the calendar or a transaction, and the notification itself carries Complete and Remind Later buttons — settle it straight from the tray.",
  },
  {
    icon: "database",
    title: "Your data, in your hands",
    body: "Everything is stored locally in a SQLite database. Export a JSON backup when you want insurance, merge one back on conflict review, and restore on a new device without losing anything.",
  },
];

// Slide titles carry inline <b> emphasis (rendered by components/ui/Text);
// the accessibility labels must not repeat that markup as literal characters.
function plainTitle(title) {
  return title.replace(/<\/?b>/g, "");
}

export function OnboardingCarousel() {
  const { colors, spacing, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef(null);
  // The viewport width is only known after layout; scrollTo needs it to jump
  // exactly one page, and paging before it lands would scroll to NaN.
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const complete = useOnboardingStore((state) => state.complete);
  // Respect the OS animation preference, exactly like Screen/ToastView do.
  const reduceMotion = useReducedMotion();

  const last = index === SLIDES.length - 1;

  const goTo = (page) => {
    if (width <= 0) return;
    const next = Math.min(Math.max(page, 0), SLIDES.length - 1);
    scrollRef.current?.scrollTo({ x: next * width, animated: !reduceMotion });
    // Momentum scrolling reports its own position on native; setting it here
    // too keeps dots/Back correct on platforms that never fire the event.
    setIndex(next);
  };

  const finish = () => void complete();

  // The tour's ending is a way in, not just away: finishing on the last
  // slide lands on Home, so a replay opened from deep in the app (Help &
  // Guide) ends at the starting point rather than back in place.
  const getStarted = () => {
    complete();
    router.navigate("/");
  };

  const slideInner = {
    alignItems: "center",
    gap: spacing.lg,
    maxWidth: 480,
    width: "100%",
  };

  return (
    <View
      style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]}
      accessibilityViewIsModal
    >
      {/* Back and Skip bracket the page — user freedom to leave or retrace
          without paging forward through anything they have already seen. */}
      <View
        style={{
          alignItems: "center",
          flexDirection: "row",
          justifyContent: "space-between",
          paddingHorizontal: spacing.lg,
          paddingTop: insets.top + spacing.sm,
        }}
      >
        {index > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous slide"
            hitSlop={12}
            onPress={() => goTo(index - 1)}
            style={({ pressed }) => ({
              alignItems: "center",
              flexDirection: "row",
              gap: spacing.xs,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Icon name="chevronLeft" size={20} color={colors.textMuted} />
            <Text variant="label" tone="muted">
              Back
            </Text>
          </Pressable>
        ) : (
          <View />
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Skip introduction"
          hitSlop={14}
          onPress={finish}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        >
          <Text variant="label" tone="muted">
            Skip
          </Text>
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEnabled={width > 0}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        onMomentumScrollEnd={(event) => {
          // Only the scroll EVENT's layoutWidth is trustworthy for the page
          // offset; the `width` state from onLayout divides by a real number
          // and never produces NaN dot indices.
          if (width > 0)
            setIndex(Math.round(event.nativeEvent.contentOffset.x / width));
        }}
        style={styles.pages}
      >
        {SLIDES.map((slide, i) => {
          const active = i === index;
          // Re-mounting the Animated views when a slide becomes active is
          // what replays the entrance fade for each visit; a slide that is
          // merely adjacent renders the same content with no transition.
          const contentKey = active ? "on" : "off";
          const entering =
            active && !reduceMotion ? FadeInDown.duration(240) : undefined;
          return (
            <View
              key={slide.title}
              style={[styles.slide, width > 0 ? { width } : null]}
              accessible
              accessibilityLabel={`Slide ${i + 1} of ${SLIDES.length}. ${plainTitle(slide.title)}. ${slide.body}`}
            >
              <Animated.View
                key={`icon-${contentKey}`}
                entering={entering}
                style={slideInner}
              >
                <View
                  style={{
                    alignItems: "center",
                    backgroundColor: colors.primarySoft,
                    borderRadius: 96,
                    height: 96,
                    justifyContent: "center",
                    width: 96,
                  }}
                >
                  <Icon name={slide.icon} size={44} color={colors.primary} />
                </View>
                <Animated.View
                  key={`title-${contentKey}`}
                  entering={entering?.delay(80)}
                  style={{ width: "100%" }}
                >
                  <Text variant="display" style={{ textAlign: "center" }}>
                    {slide.title}
                  </Text>
                </Animated.View>
                <Animated.View
                  key={`body-${contentKey}`}
                  entering={entering?.delay(160)}
                  style={{ width: "100%" }}
                >
                  <Text
                    variant="body"
                    tone="muted"
                    style={{ textAlign: "center", lineHeight: 24 }}
                  >
                    {slide.body}
                  </Text>
                </Animated.View>
              </Animated.View>
            </View>
          );
        })}
      </ScrollView>

      <View
        style={{
          alignItems: "center",
          gap: spacing.sm,
          paddingBottom: insets.bottom + spacing.xl,
          paddingHorizontal: spacing.xl,
        }}
      >
        <Text variant="caption" tone="faint">
          {index + 1} of {SLIDES.length}
        </Text>
        {/* Each dot is a button: tapping is a first-class way to jump pages,
            not decoration. hitSlop grows the touch area without disturbing
            the visual 8px rhythm — the slops of neighbours exactly fill the
            gap, never overlap it. */}
        <View style={styles.dots}>
          {SLIDES.map((slide, i) => (
            <Pressable
              key={slide.title}
              accessibilityRole="button"
              accessibilityLabel={`Go to slide ${i + 1}: ${plainTitle(slide.title)}`}
              accessibilityState={{ selected: i === index }}
              hitSlop={{ top: 18, bottom: 18, left: 4, right: 4 }}
              onPress={() => goTo(i)}
            >
              <View
                style={{
                  backgroundColor: i === index ? colors.primary : colors.border,
                  borderRadius: radius.pill,
                  height: 8,
                  width: i === index ? 20 : 8,
                }}
              />
            </Pressable>
          ))}
        </View>
        <View style={{ width: "100%", marginTop: spacing.sm }}>
          {last ? (
            <Button label="Get started" onPress={getStarted} />
          ) : (
            <Button label="Next" onPress={() => goTo(index + 1)} />
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pages: { flexGrow: 1 },
  slide: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  dots: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
});
