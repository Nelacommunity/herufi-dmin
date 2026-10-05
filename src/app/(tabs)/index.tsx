import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { ErrorState, Skeleton, Text } from '@/components/ui';
import { BarChart, Card, CardTitle, Delta, FilterChips, Row, StatTile, StatusBadge, useReloadOnFocus } from '@/components/admin';
import { getOverview, listCoupons } from '@/lib/admin';
import { PERMISSIONS, ROLE_LABEL } from '@/lib/permissions';
import { ORDER_STATUSES, ORDER_STATUS_LABEL } from '@/lib/constants';
import { formatDate, formatPrice } from '@/lib/format';
import { useAsync } from '@/lib/use-async';
import { useSession } from '@/providers/session';
import { useTheme } from '@/theme';

const RANGES = [{ value: '7', label: '7 days' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }] as const;
type Range = (typeof RANGES)[number]['value'];

export default function Overview() {
  const { can } = useSession();
  return can('analytics.view') ? <Dashboard /> : <StaffHome />;
}

/** Home for staff without the dashboard permission: their own discount codes and what they can do. */
function StaffHome() {
  const { colors } = useTheme();
  const { profile, can } = useSession();
  const data = useAsync(listCoupons, []);
  useReloadOnFocus(data.reload);
  const mine = (data.data ?? []).filter((c) => c.assigned_admin_id === profile?.user_id);
  const orders = mine.reduce((n, c) => n + c.stats.orders, 0);
  const revenue = mine.reduce((n, c) => n + c.stats.revenue, 0);
  const granted = PERMISSIONS.filter((p) => can(p.key));
  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={data.refreshing} onRefresh={data.reload} />}>
      <View style={{ gap: 2 }}>
        <Text variant="h2">Welcome{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}</Text>
        <Text tone="muted">{ROLE_LABEL[profile?.role ?? 'admin']} · {granted.length} permission{granted.length === 1 ? '' : 's'}</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <StatTile style={{ flex: 1 }} label="Orders from your codes" value={String(orders)} />
        <StatTile style={{ flex: 1 }} label="Revenue" value={formatPrice(revenue)} />
      </View>
      <Card padded={false}>
        <View style={{ padding: 16, paddingBottom: 4 }}><CardTitle title="Your discount codes" icon="percent" /></View>
        {mine.map((c) => (
          <Row key={c.id} onPress={() => router.push({ pathname: '/discount/[code]', params: { code: c.code } })}
            title={c.code} subtitle={`${c.stats.orders} order${c.stats.orders === 1 ? '' : 's'} · ${c.type === 'percentage' ? `${c.value}% off` : `${formatPrice(c.value)} off`}`}
            right={<Text variant="label" style={{ fontVariant: ['tabular-nums'] }}>{formatPrice(c.stats.revenue)}</Text>} />
        ))}
        {!data.loading && !mine.length && <Text tone="muted" style={{ padding: 16 }}>No codes are assigned to you yet. A super admin can assign one from Discounts.</Text>}
      </Card>
      <Card style={{ gap: 8 }}>
        <CardTitle title="What you can do" icon="shield" />
        {granted.length ? granted.map((p) => (
          <View key={p.key} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <Feather name="check" size={15} color={colors.success} />
            <Text style={{ flex: 1 }}>{p.label}</Text>
          </View>
        )) : <Text tone="muted">No permissions yet. Ask a super admin to grant you access.</Text>}
      </Card>
    </ScrollView>
  );
}

function Dashboard() {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const { profile } = useSession();
  const [range, setRange] = useState<Range>('30');
  const days = Number(range);
  const data = useAsync(() => getOverview(days), [days]);
  useReloadOnFocus(data.reload);

  if (data.error && !data.data) return <ErrorState onRetry={data.reload} message={data.error?.message} />;
  const d = data.data;
  const m = d?.metrics;
  const totalByStatus = m ? Object.values(m.status_breakdown).reduce((a, b) => a + (b ?? 0), 0) || 1 : 1;
  const half = (width - 32 - 10) / 2;
  const hour = new Date().getHours();

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ paddingBottom: 32, gap: 16 }}
      refreshControl={<RefreshControl refreshing={data.refreshing} onRefresh={data.reload} />}>
      <View style={{ paddingHorizontal: 16, paddingTop: 4, gap: 2 }}>
        <Text variant="h2">{hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'}{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}</Text>
        <Text tone="muted">How the store is doing over the last {days} days.</Text>
      </View>
      <FilterChips options={[...RANGES]} value={range} onChange={setRange} />

      {!m ? (
        <View style={{ paddingHorizontal: 16, gap: 10 }}>
          <Skeleton style={{ height: 110, borderRadius: 16 }} />
          <View style={{ flexDirection: 'row', gap: 10 }}><Skeleton style={{ flex: 1, height: 100, borderRadius: 16 }} /><Skeleton style={{ flex: 1, height: 100, borderRadius: 16 }} /></View>
          <Skeleton style={{ height: 200, borderRadius: 16 }} />
        </View>
      ) : (
        <>
          <View style={{ paddingHorizontal: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            <StatTile style={{ width: '100%' }} label="Revenue" value={formatPrice(m.revenue)} delta={<Delta now={Number(m.revenue)} prev={Number(m.revenue_prev)} />} note={`vs previous ${days} days`} />
            <StatTile style={{ width: half }} label="Orders" value={m.orders.toLocaleString()} delta={<Delta now={m.orders} prev={m.orders_prev} />} note={`last ${days} days`} />
            <StatTile style={{ width: half }} label="Avg order value" value={formatPrice(m.aov)} note="Excludes cancelled" />
            <StatTile style={{ width: half }} label="Customers" value={m.customers.toLocaleString()} note={`${m.new_customers} new`} />
            <StatTile style={{ width: half }} label="Active products" value={m.products.toLocaleString()} note={`${m.low_stock} low on stock`} />
            <StatTile style={{ width: half }} label="Repeat purchase" value={`${m.repeat_rate}%`} note="2+ orders" />
            <StatTile style={{ width: half }} label="Cart to order" value={`${m.cart_to_order}%`} note="Signed-in shoppers" />
          </View>

          <Card style={{ marginHorizontal: 16 }}>
            <CardTitle title="Daily revenue" right={<Text variant="small" tone="muted">{formatPrice(m.revenue)}</Text>} />
            <BarChart data={m.daily} width={width - 32 - 34} />
          </Card>

          <Card style={{ marginHorizontal: 16 }}>
            <CardTitle title="Orders by status" />
            <View style={{ gap: 12 }}>
              {ORDER_STATUSES.map((s) => {
                const n = m.status_breakdown[s] ?? 0;
                return (
                  <Pressable key={s} onPress={() => router.navigate({ pathname: '/orders', params: { status: s } })} style={{ gap: 6 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text variant="small">{ORDER_STATUS_LABEL[s]}</Text>
                      <Text variant="small" tone="muted" style={{ fontVariant: ['tabular-nums'] }}>{n}</Text>
                    </View>
                    <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.surface2, overflow: 'hidden' }}>
                      <View style={{ height: '100%', width: `${(n / totalByStatus) * 100}%`, borderRadius: 3, backgroundColor: s === 'cancelled' ? colors.sale : colors.foreground, opacity: 0.85 }} />
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </Card>

          <Card style={{ marginHorizontal: 16 }} padded={false}>
            <View style={{ padding: 16, paddingBottom: 4 }}>
              <CardTitle title="Recent orders" right={<Pressable onPress={() => router.navigate('/orders')} hitSlop={8}><Text variant="small" style={{ fontWeight: '700' }}>View all</Text></Pressable>} />
            </View>
            {d.recent.map((o) => (
              <Row key={o.id} onPress={() => router.push({ pathname: '/order/[id]', params: { id: o.id } })}
                title={o.order_number} subtitle={`${o.email} · ${formatDate(o.created_at)}`}
                right={<View style={{ alignItems: 'flex-end', gap: 4 }}><Text variant="label" style={{ fontVariant: ['tabular-nums'] }}>{formatPrice(o.total)}</Text><StatusBadge status={o.status} /></View>} />
            ))}
            {!d.recent.length && <Text tone="muted" style={{ padding: 16 }}>No orders yet.</Text>}
          </Card>

          <Card style={{ marginHorizontal: 16 }}>
            <CardTitle title="Top products" />
            <View style={{ gap: 10 }}>
              {m.top_products.map((p, i) => (
                <View key={p.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text tone="subtle" style={{ width: 16, fontVariant: ['tabular-nums'] }}>{i + 1}</Text>
                  <Text style={{ flex: 1 }} numberOfLines={1}>{p.name}</Text>
                  <Text variant="small" tone="muted" style={{ fontVariant: ['tabular-nums'] }}>{formatPrice(p.revenue)}</Text>
                </View>
              ))}
              {!m.top_products.length && <Text tone="muted">No sales yet.</Text>}
            </View>
          </Card>

          <Card style={{ marginHorizontal: 16 }} padded={false}>
            <View style={{ padding: 16, paddingBottom: 4 }}>
              <CardTitle title="Low stock" icon="alert-triangle" right={<Pressable onPress={() => router.navigate({ pathname: '/products', params: { filter: 'low' } })} hitSlop={8}><Text variant="small" style={{ fontWeight: '700' }}>See all</Text></Pressable>} />
            </View>
            {d.lowStock.map((p) => (
              <Row key={p.id} onPress={() => router.push({ pathname: '/product/[id]', params: { id: p.id } })} title={p.name}
                right={<View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: p.stock_quantity === 0 ? colors.saleSoft : colors.surface2 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: p.stock_quantity === 0 ? colors.sale : colors.foreground }}>{p.stock_quantity === 0 ? 'Out' : p.stock_quantity}</Text>
                </View>} />
            ))}
            {!d.lowStock.length && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 16 }}>
                <Feather name="check-circle" size={16} color={colors.success} />
                <Text tone="muted">Everything is well stocked.</Text>
              </View>
            )}
          </Card>
        </>
      )}
    </ScrollView>
  );
}
