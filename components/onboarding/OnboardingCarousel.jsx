import { useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useOnboardingStore } from "../../stores/onboardingStore";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Text } from "../ui/Text";
import { useTheme } from "../ui/ThemeProvider";

/**
 * First-launch tour: five slides over the app's real strengths, written
 * from what the screens actually do. It is an overlay mounted above the
 * navigator (see app/_layout.jsx), not a route — nothing ever navigates
 * to or away from it, so it cannot redirect-loop or flash the tabs
 * underneath. Content here is view-only: it writes no data and changes
 * no settings; finishing simply hides the overlay (and outside Expo Go
 * marks the tour seen, which the store owns).
 */
const SLIDES = [
  {
    icon: "wallet",
    title: "Welcome to <b>Budgetarian</b>",
    body: "A budgeting app that runs entirely on this device. No account, no cloud, no tracking — it works fully offline, and your money data never leaves the phone unless you export it yourself.",
  },
  {
    icon: "folder",
    title: "Budgets, grouped your way",
    body: "Each budget is a period — a month, a trip, a project. Folders are an optional shelf to line them up on: name them by year, by purpose, anything. Their balances are always just income minus expenses, recalculated live.",
  },
  {
    icon: "bills",
    title: "Receipts you can photograph",
    body: "Record income and expenses with tags and breakdowns, and attach a receipt in the same section — take a photo or pick from the gallery. The app reads the printed text on-device and lets you tap exactly which lines fill each field.",
  },
  {
    icon: "clock",
    title: "Reminders that answer back",
    body: "Set a reminder on any transaction and it fires at its time. The notification itself carries two buttons: Complete finishes it there and then, Remind Later pushes it ten minutes — without opening the app.",
  },
  {
    icon: "database",
    title: "Your data, in your hands",
    body: "Everything is stored locally, and one tap exports it all as a JSON backup you keep wherever you like. Restoring is your choice too: merge a backup into what is on the phone, or fully replace it.",
  },
];

export function OnboardingCarousel() {
  const { colors, spacing, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const complete = useOnboardingStore((state) => state.complete);
  const [index, setIndex] = useState(0);
  const [width, setWidth] = useState(0);
  const scrollRef = useRef(null);
  const last = index === SLIDES.length - 1;

  const finish = () => void complete();

  // The pager drives the dots, but the buttons drive the pager too: Next
  // scrolls, and the momentum handler settles the index either way.
  const goNext = () => {
    if (width > 0)
      scrollRef.current?.scrollTo({ x: (index + 1) * width, animated: true });
  };

  return (
    <View
      style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]}
      accessibilityViewIsModal
    >
      {/* Dismiss lives at the top from the first slide: the tour is always
          skippable, and skipping is the same “seen” outcome as finishing. */}
      <View
        style={[
          styles.skipRow,
          {
            paddingTop: insets.top + spacing.sm,
            paddingHorizontal: spacing.lg,
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Skip introduction"
          hitSlop={12}
          onPress={finish}
          style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
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
          // The measured page width from onLayout is the divisor: the scroll
          // event's own nativeEvent has no reliable width field, and dividing
          // by undefined used to park the index at NaN — no dot ever lit and
          // the button never turned into “Get started”.
          if (width > 0) {
            setIndex(Math.round(event.nativeEvent.contentOffset.x / width));
          }
        }}
        style={styles.pages}
      >
        {SLIDES.map((slide, slideIndex) => (
          <View
            key={slide.title}
            style={[
              styles.slide,
              width > 0 ? { width } : { width: "100%" },
              { paddingHorizontal: spacing.xl, gap: spacing.lg },
            ]}
          >
            <View
              style={{
                alignItems: "center",
                justifyContent: "center",
                width: 96,
                height: 96,
                borderRadius: 96,
                backgroundColor: colors.primarySoft,
              }}
            >
              <Icon name={slide.icon} size={44} color={colors.primary} />
            </View>
            <Text variant="display" style={{ textAlign: "center" }}>
              {slide.title}
            </Text>
            <Text
              variant="body"
              tone="muted"
              style={{ textAlign: "center", lineHeight: 24 }}
            >
              {slide.body}
            </Text>
          </View>
        ))}
      </ScrollView>

      <View
        style={{
          alignItems: "center",
          gap: spacing.sm,
          paddingHorizontal: spacing.xl,
          paddingBottom: insets.bottom + spacing.xl,
        }}
      >
        <View style={styles.dots} accessibilityElementsHidden>
          {SLIDES.map((slide, dotIndex) => (
            <View
              key={slide.title}
              style={{
                height: 8,
                borderRadius: radius.pill,
                width: dotIndex === index ? 20 : 8,
                backgroundColor:
                  dotIndex === index ? colors.primary : colors.border,
              }}
            />
          ))}
        </View>
        <View style={{ width: "100%", marginTop: spacing.sm }}>
          {last ? (
            <Button label="Get started" onPress={finish} />
          ) : (
            <Button label="Next" onPress={goNext} />
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  skipRow: {
    alignItems: "flex-end",
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  pages: {
    flex: 1,
  },
  slide: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  dots: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
  },
});
