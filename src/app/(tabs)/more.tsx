import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router, type Href } from 'expo-router';
import Constants from 'expo-constants';
import { Feather } from '@expo/vector-icons';
import { Button, Text } from '@/components/ui';
import { Avatar, Card, confirm, Pill, useReloadOnFocus } from '@/components/admin';
import { listQuestions } from '@/lib/admin';
import { SITE } from '@/lib/constants';
import { ROLE_LABEL } from '@/lib/permissions';
import { useAsync } from '@/lib/use-async';
import { useSession } from '@/providers/session';
import { radius, useTheme, type ThemeMode } from '@/theme';

type Item = { icon: keyof typeof Feather.glyphMap; label: string; hint: string; href: Href; badge?: number; show: boolean };

export default function More() {
  const { colors, mode, setMode } = useTheme();
  const { profile, user, signOut, can, isSuper } = useSession();
  const unanswered = useAsync(() => (can('questions.answer') ? listQuestions(true).then((q) => q.length).catch(() => 0) : Promise.resolve(0)), []);
  useReloadOnFocus(unanswered.reload);

  const items: Item[] = [
    { icon: 'shield', label: 'Staff', hint: 'Admins, super admins and permissions', href: '/staff', show: isSuper },
    { icon: 'folder', label: 'Categories', hint: 'Order, images and names', href: '/categories', show: can('categories.manage') },
    { icon: 'percent', label: 'Discounts', hint: can('discounts.manage') ? 'Codes, owners and sales per code' : 'Your codes and their orders', href: '/discounts', show: true },
    { icon: 'anchor', label: 'Shipping rates', hint: 'Air, express and sea cargo', href: '/shipping', show: can('shipping.manage') },
    { icon: 'message-circle', label: 'Customer questions', hint: 'Answer product questions', href: '/questions', badge: unanswered.data ?? 0, show: can('questions.answer') },
  ].filter((i) => i.show) as Item[];

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Avatar name={profile?.full_name} email={user?.email} uri={profile?.avatar_url} size={52} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="h3" numberOfLines={1}>{profile?.full_name ?? 'Admin'}</Text>
          <Text variant="small" tone="muted" numberOfLines={1}>{user?.email}</Text>
        </View>
        <Pill label={ROLE_LABEL[profile?.role ?? 'admin']} tone={isSuper ? 'dark' : 'neutral'} />
      </Card>

      <Card padded={false}>
        {items.map((i, n) => (
          <Pressable key={i.label} onPress={() => router.push(i.href)}
            style={({ pressed }) => [styles.row, n > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }, pressed && { backgroundColor: colors.surface2 }]}>
            <View style={[styles.icon, { backgroundColor: colors.surface2 }]}><Feather name={i.icon} size={18} color={colors.foreground} /></View>
            <View style={{ flex: 1 }}>
              <Text variant="label">{i.label}</Text>
              <Text variant="small" tone="muted">{i.hint}</Text>
            </View>
            {i.badge ? <View style={[styles.badge, { backgroundColor: colors.sale }]}><Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{i.badge}</Text></View> : null}
            <Feather name="chevron-right" size={18} color={colors.subtle} />
          </Pressable>
        ))}
      </Card>

      <Card style={{ gap: 10 }}>
        <Text variant="label">Appearance</Text>
        <View style={[styles.segment, { backgroundColor: colors.surface2 }]}>
          {(['system', 'light', 'dark'] as ThemeMode[]).map((m) => (
            <Pressable key={m} onPress={() => setMode(m)} style={[styles.segItem, mode === m && { backgroundColor: colors.surface, boxShadow: '0 1px 3px rgba(0,0,0,0.12)' }]}>
              <Text variant="small" style={{ fontWeight: '700', color: mode === m ? colors.foreground : colors.muted, textTransform: 'capitalize' }}>{m}</Text>
            </Pressable>
          ))}
        </View>
      </Card>

      <Button variant="secondary" icon="external-link" title="Open the store" onPress={() => Linking.openURL(SITE.url)} />
      <Button variant="secondary" icon="log-out" title="Sign out" onPress={async () => { if (await confirm('Sign out?', 'You will need your password to sign back in.', 'Sign out', false)) await signOut(); }} />
      <Text variant="small" tone="subtle" style={{ textAlign: 'center' }}>Herufi Admin · version {Constants.expoConfig?.version ?? '1.0.0'}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13 },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  badge: { minWidth: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  segment: { flexDirection: 'row', padding: 3, borderRadius: radius.full },
  segItem: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: radius.full },
});
