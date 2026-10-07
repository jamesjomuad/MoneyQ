import { StyleSheet, View } from "react-native";

import { Text } from "./Text";
// import { useTheme } from './ThemeProvider';

/** Labelled figure used in summary cards. */
export function Stat({ label, value, tone = "default", style }) {
  // const { spacing } = useTheme();

  return (
    <View style={[styles.stat, style]}>
      <Text variant="caption" tone="faint">
        {label}
      </Text>
      <Text
        variant="heading"
        tone={tone}
        numberOfLines={1}
        style={{ marginTop: 2 }}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stat: {
    flex: 1,
    marginRight: 8,
  },
});
