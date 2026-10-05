import type { ColorValue } from 'react-native';
import { Tabs } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSession } from '@/providers/session';
import { useTheme } from '@/theme';

export default function TabsLayout() {
  const { colors } = useTheme();
  const { can } = useSession();
  // Tabs a staff member can't use are hidden (href: null); the database refuses the data anyway.
  const show = (ok: boolean) => (ok ? {} : { href: null });
  const icon = (name: keyof typeof Feather.glyphMap) => function TabIcon({ color }: { color: ColorValue }) { return <Feather name={name} size={21} color={color as string} />; };
  return (
    <Tabs screenOptions={{
      headerShadowVisible: false,
      headerStyle: { backgroundColor: colors.background },
      headerTitleStyle: { color: colors.foreground, fontWeight: '700', fontSize: 18 },
      headerTitleAlign: 'left',
      tabBarActiveTintColor: colors.foreground,
      tabBarInactiveTintColor: colors.subtle,
      tabBarStyle: { backgroundColor: colors.background, borderTopColor: colors.border },
      tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
    }}>
      <Tabs.Screen name="index" options={{ title: can('analytics.view') ? 'Overview' : 'Home', tabBarIcon: icon(can('analytics.view') ? 'bar-chart-2' : 'home') }} />
      <Tabs.Screen name="orders" options={{ title: 'Orders', tabBarIcon: icon('shopping-cart'), ...show(can('orders.view')) }} />
      <Tabs.Screen name="products" options={{ title: 'Products', tabBarIcon: icon('package'), ...show(can('products.create') || can('products.edit') || can('products.delete') || can('questions.answer')) }} />
      <Tabs.Screen name="customers" options={{ title: 'Customers', tabBarIcon: icon('users'), ...show(can('customers.view')) }} />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: icon('menu') }} />
    </Tabs>
  );
}
