import { ActivityIndicator, View } from 'react-native';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider as NavThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from '@/theme';
import { ToastProvider } from '@/providers/toast';
import { SessionProvider, useSession } from '@/providers/session';

function Navigator() {
  const { colors, dark } = useTheme();
  const { status } = useSession();
  const base = dark ? DarkTheme : DefaultTheme;

  if (status === 'loading') {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}><ActivityIndicator color={colors.muted} /></View>;
  }
  const isAdmin = status === 'admin';
  return (
    <NavThemeProvider value={{ ...base, colors: { ...base.colors, background: colors.background, card: colors.background, text: colors.foreground, border: colors.border, primary: colors.foreground } }}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShadowVisible: false, headerTintColor: colors.foreground, headerStyle: { backgroundColor: colors.background }, headerBackButtonDisplayMode: 'minimal', contentStyle: { backgroundColor: colors.background } }}>
        {/* Admin screens exist only for an active admin. Row Level Security enforces the same rule in the database. */}
        <Stack.Protected guard={isAdmin}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="order/[id]" options={{ title: 'Order' }} />
          <Stack.Screen name="product/[id]" options={{ title: 'Product' }} />
          <Stack.Screen name="customer/[id]" options={{ title: 'Customer' }} />
          <Stack.Screen name="categories" options={{ title: 'Categories' }} />
          <Stack.Screen name="discounts" options={{ title: 'Discounts' }} />
          <Stack.Screen name="shipping" options={{ title: 'Shipping rates' }} />
          <Stack.Screen name="questions" options={{ title: 'Customer questions' }} />
          <Stack.Screen name="staff" options={{ title: 'Staff' }} />
          <Stack.Screen name="discount/[code]" options={{ title: 'Discount' }} />
        </Stack.Protected>
        <Stack.Protected guard={!isAdmin}>
          <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        </Stack.Protected>
      </Stack>
    </NavThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <ToastProvider>
            <SessionProvider>
              <Navigator />
            </SessionProvider>
          </ToastProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
