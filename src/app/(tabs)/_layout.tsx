import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';
import { colors, type } from '@/ui/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

const TAB_BAR_HEIGHT = 64;
const ICON_SIZE = 24;

// Builds the icon for one tab. The tab always shows a word next to it (the label), so the icon is never the only signal.
function tabIcon(active: IconName, inactive: IconName) {
  return function TabIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
    return <Ionicons name={focused ? active : inactive} size={ICON_SIZE} color={typeof color === 'string' ? color : colors.textMuted} />;
  };
}

// The four main places of the app. Forms and detail screens are NOT in this group: they live in the root Stack
// above it, so the tab bar is hidden while they are open. On the web this is like a layout route with a nav bar.
// No `key` here: the dataVersion key stays on the root Stack so a restore remounts the tabs too.
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        // The tabs sit under a root Stack with no header, so each tab draws its own title bar.
        headerShown: true,
        headerTitleAlign: 'left',
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { height: TAB_BAR_HEIGHT, backgroundColor: colors.background, borderTopColor: colors.border },
        tabBarItemStyle: { paddingVertical: 6 },
        tabBarLabelStyle: { fontSize: type.label.fontSize, fontWeight: type.label.fontWeight },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Beranda', headerTitle: 'Mas Catat', tabBarIcon: tabIcon('home', 'home-outline') }} />
      <Tabs.Screen name="riwayat" options={{ title: 'Riwayat', tabBarIcon: tabIcon('time', 'time-outline') }} />
      <Tabs.Screen name="laporan" options={{ title: 'Laporan', tabBarIcon: tabIcon('bar-chart', 'bar-chart-outline') }} />
      <Tabs.Screen name="menu" options={{ title: 'Menu', tabBarIcon: tabIcon('menu', 'menu-outline') }} />
    </Tabs>
  );
}
