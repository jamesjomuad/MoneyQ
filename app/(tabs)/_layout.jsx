import { Tabs } from 'expo-router';

import { BottomTabBar } from '../../components/navigation/BottomTabBar';
import { TabSwipeArea } from '../../components/navigation/TabSwipeArea';
import { Icon } from '../../components/ui/Icon';
import { useTheme } from '../../components/ui/ThemeProvider';

/** The tab scene, not the modal stack or tab bar, is the swipe boundary. */
function tabSceneLayout({ children, navigation }) {
  return <TabSwipeArea navigation={navigation}>{children}</TabSwipeArea>;
}

/**
 * Home sums things up, Budgets manages them, Calendar dates them, Reports
 * analyses them and Settings holds preferences. Each screen keeps its own job,
 * so a budget is never edited in two places.
 */
export default function TabsLayout() {
  const { colors } = useTheme();

  return (
    <Tabs
      screenLayout={tabSceneLayout}
      screenOptions={{
        // The tab titles are decorative; the tab bar is icon-only, so the
        // header is dropped to hand the vertical space back to content.
        // The per-screen `title` options stay: they seed each tab's
        // accessibility name.
        headerShown: false,
        sceneStyle: { backgroundColor: colors.background },
      }}
      tabBar={(props) => <BottomTabBar {...props} />}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Icon name="home" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="budgets"
        options={{
          title: 'Budgets',
          tabBarIcon: ({ color, size }) => <Icon name="wallet" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'Calendar',
          tabBarIcon: ({ color, size }) => <Icon name="calendar" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: 'Reports',
          tabBarIcon: ({ color, size }) => <Icon name="pie" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => <Icon name="settings" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
