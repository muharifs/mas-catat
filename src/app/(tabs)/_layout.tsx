import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { StyleSheet, View, type ColorValue } from 'react-native';
import { colors, elevation, fonts, radius, spacing, type } from '@/ui/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

const TAB_BAR_HEIGHT = 64;
const ICON_SIZE = 24;
const PILL_WIDTH = 56;
const PILL_HEIGHT = 28;

// Builds the icon for one tab. The tab always shows a word next to it (the label), so the icon is never the only signal.
// The active tab gets a teal pill behind a filled DARK icon (dark on the teal accent passes contrast; the pill is a
// shape cue, so the active tab is not shown by colour alone). Inactive: outline icon in the tertiary text colour.
function tabIcon(active: IconName, inactive: IconName) {
  return function TabIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
    return (
      <View style={[styles.pill, focused && styles.pillActive]}>
        <Ionicons
          name={focused ? active : inactive}
          size={ICON_SIZE}
          color={focused ? colors.text : typeof color === 'string' ? color : colors.textTertiary}
        />
      </View>
    );
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
        // Active label in brandStrong (the pure teal is too light for text); inactive in textTertiary (5.4:1).
        tabBarActiveTintColor: colors.brandStrong,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarStyle: { height: TAB_BAR_HEIGHT, backgroundColor: colors.bgCard, borderTopColor: colors.divider, ...elevation.high },
        tabBarItemStyle: { paddingVertical: spacing.xs },
        sceneStyle: { backgroundColor: colors.bgPage },
        headerStyle: { backgroundColor: colors.bgPage },
        headerShadowVisible: false,
        headerTintColor: colors.text,
        tabBarLabelStyle: { fontSize: type.label.fontSize, fontFamily: type.label.fontFamily },
        headerTitleStyle: { fontFamily: fonts.bold },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Beranda', headerTitle: 'Mas Catat', tabBarIcon: tabIcon('home', 'home-outline') }} />
      <Tabs.Screen name="riwayat" options={{ title: 'Riwayat', tabBarIcon: tabIcon('time', 'time-outline') }} />
      <Tabs.Screen name="laporan" options={{ title: 'Laporan', tabBarIcon: tabIcon('bar-chart', 'bar-chart-outline') }} />
      <Tabs.Screen name="menu" options={{ title: 'Menu', tabBarIcon: tabIcon('menu', 'menu-outline') }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  pill: { width: PILL_WIDTH, height: PILL_HEIGHT, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  pillActive: { backgroundColor: colors.brand },
});
