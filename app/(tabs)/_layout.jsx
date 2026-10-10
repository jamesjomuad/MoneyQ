import { Tabs } from 'expo-router';

import { BottomTabBar } from '../../components/navigation/BottomTabBar';
import { TabSwipeArea } from '../../components/navigation/TabSwipeArea';
import { Icon } from '../../components/ui/Icon';
import { useTheme } from '../../components/ui/ThemeProvider';

/** The tab scene, not the modal stack or tab bar, is the swipe boundary. */
function tabSceneLayout({ children, navigation }) {
  return <TabSwipeArea navigation={navigation}>{children}</TabSwipeArea>;
}

/** Home holds budgets; Settings holds preferences. Budgets are not duplicated. */
export default function TabsLayout() {
  const { colors } = useTheme();

  return (
    <Tabs
      screenLayout={tabSceneLayout}
      screenOptions={{
        // The tab titles are decorative; the tab bar carries the labels, so
        // the header is dropped to hand the vertical space back to content.
        // The per-screen `title` options stay: the custom tab bar reads them.
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
