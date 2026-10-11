import { StyleSheet, View } from "react-native";

import { Text } from "./Text";
// import { useTheme } from './ThemeProvider';

/** Labelled figure used in summary cards. */
export function Stat({ label, value, tone = "default", style, labelColor, valueColor }) {
  return (
    <View style={[styles.stat, style]}>
      <Text
        variant="caption"
        tone={labelColor ? "default" : "faint"}
        style={labelColor ? { color: labelColor } : undefined}
      >
        {label}
      </Text>
      <Text
        variant="heading"
        tone={valueColor ? "default" : tone}
        numberOfLines={1}
        style={[{ marginTop: 2 }, valueColor ? { color: valueColor } : undefined]}
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
