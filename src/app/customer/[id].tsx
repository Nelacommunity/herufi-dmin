import { useState } from 'react';
import { Linking, RefreshControl, ScrollView, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Button, Divider, EmptyState, ErrorState, Skeleton, Text } from '@/components/ui';
import { Avatar, Card, CardTitle, confirm, errorMessage, Pill, Row, StatTile, StatusBadge, NoAccess } from '@/components/admin';
import { getCustomer, setCustomerStatus } from '@/lib/admin';
import { formatDate, formatPrice } from '@/lib/format';
import { ROLE_LABEL, type StaffRole } from '@/lib/permissions';
import { useAsync } from '@/lib/use-async';
import { useSession } from '@/providers/session';
import { useToast } from '@/providers/toast';
import { useTheme } from '@/theme';

export default function CustomerDetail() {
  const { can } = useSession();
  return can('customers.view') ? <CustomerDetailScreen /> : <NoAccess what="customers" />;
}

function CustomerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { user, can, isSuper } = useSession();
  const toast = useToast();
  const data = useAsync(() => getCustomer(id), [id]);
  const [busy, setBusy] = useState(false);

  if (data.error && !data.data) return <ErrorState onRetry={data.reload} message={data.error?.message} />;
  if (data.loading) return <View style={{ padding: 16, gap: 12 }}><Skeleton style={{ height: 90 }} /><Skeleton style={{ height: 180 }} /></View>;
  if (!data.data) return <EmptyState icon="user" title="Customer not found" />;
  const { profile: c, orders, spent, average } = data.data;
  const isMe = user?.id === c.user_id;
  const suspended = c.status === 'suspended';

  async function toggle() {
    const next = suspended ? 'active' : 'suspended';
    const ok = await confirm(
      suspended ? 'Reactivate this account?' : 'Suspend this account?',
      suspended ? `${c.email} will be able to sign in and order again.` : `${c.email} won't be able to place orders until you reactivate them.`,
      suspended ? 'Reactivate' : 'Suspend', !suspended,
    );
    if (!ok) return;
    setBusy(true);
    try {
      await setCustomerStatus(c.user_id, next);
      toast({ title: next === 'suspended' ? 'Account suspended' : 'Account reactivated', tone: 'success' });
      data.reload();
    } catch (e) {
      toast({ title: errorMessage(e), tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  const half = { flexBasis: '47%', flexGrow: 1 } as const;
  return (
    <>
      <Stack.Screen options={{ title: c.full_name ?? c.email ?? 'Customer' }} />
      <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={data.refreshing} onRefresh={data.reload} />}>
        <Card style={{ gap: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <Avatar name={c.full_name} email={c.email} uri={c.avatar_url} size={56} />
            <View style={{ flex: 1, gap: 3 }}>
              <Text variant="h3" numberOfLines={1}>{c.full_name ?? '—'}</Text>
              <Text tone="muted" numberOfLines={1}>{c.email}</Text>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <Pill label={suspended ? 'Suspended' : 'Active'} tone={suspended ? 'sale' : 'success'} />
                {c.role !== 'customer' && <Pill label={ROLE_LABEL[c.role as StaffRole] ?? c.role} tone="dark" />}
              </View>
            </View>
          </View>
          <Text variant="small" tone="muted">Joined {formatDate(c.created_at, 'en', 'long')}</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {c.email ? <Button size="sm" variant="secondary" icon="mail" title="Email" style={{ flex: 1 }} onPress={() => Linking.openURL(`mailto:${c.email}`)} /> : null}
            {c.phone ? <Button size="sm" variant="secondary" icon="phone" title="Call" style={{ flex: 1 }} onPress={() => Linking.openURL(`tel:${c.phone!.replace(/[^\d+]/g, '')}`)} /> : null}
          </View>
          {isMe ? (
            <Text variant="small" tone="subtle">This is your account, so you can&apos;t suspend it.</Text>
          ) : !can('customers.suspend') || (c.role !== 'customer' && !isSuper) ? null : (
            <Button variant={suspended ? 'success' : 'danger'} icon={suspended ? 'user-check' : 'slash'} title={suspended ? 'Reactivate account' : 'Suspend account'} onPress={toggle} loading={busy} />
          )}
        </Card>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          <StatTile style={half} label="Orders" value={String(orders.length)} />
          <StatTile style={half} label="Total spent" value={formatPrice(spent)} />
          <StatTile style={half} label="Average order" value={formatPrice(average)} />
          <StatTile style={half} label="Marketing emails" value={c.marketing_opt_in ? 'Subscribed' : 'No'} />
        </View>

        <Card padded={false}>
          <View style={{ padding: 16, paddingBottom: 4 }}><CardTitle title="Order history" icon="shopping-bag" /></View>
          {orders.map((o, i) => (
            <View key={o.id}>
              {i > 0 && <Divider style={{ marginLeft: 16 }} />}
              <Row onPress={() => router.push({ pathname: '/order/[id]', params: { id: o.id } })}
                title={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Text variant="label">{o.order_number}</Text><StatusBadge status={o.status} /></View>}
                subtitle={`${formatDate(o.created_at)} · ${o.item_count} item${o.item_count === 1 ? '' : 's'}`}
                right={<Text variant="label" style={{ fontVariant: ['tabular-nums'] }}>{formatPrice(o.total)}</Text>} />
            </View>
          ))}
          {!orders.length && <Text tone="muted" style={{ padding: 16 }}>No orders yet.</Text>}
        </Card>

        <Card style={{ gap: 8 }}>
          <CardTitle title="Profile" icon="user" />
          <Info label="Phone" value={c.phone ?? '—'} />
          <Info label="Role" value={ROLE_LABEL[c.role as StaffRole] ?? c.role} />
          <Info label="Marketing emails" value={c.marketing_opt_in ? 'Subscribed' : 'Not subscribed'} />
        </Card>
      </ScrollView>
    </>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
      <Text tone="muted">{label}</Text>
      <Text>{value}</Text>
    </View>
  );
}
