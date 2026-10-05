import { FlatList, RefreshControl, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Divider, EmptyState, ErrorState, Skeleton, Text } from '@/components/ui';
import { Row, StatTile, StatusBadge } from '@/components/admin';
import { getCouponOrders } from '@/lib/admin';
import { formatDate, formatPrice } from '@/lib/format';
import { useAsync } from '@/lib/use-async';
import { useSession } from '@/providers/session';
import { useTheme } from '@/theme';

/** Orders placed with one discount code: how much a staff member's code has brought in. */
export default function DiscountOrders() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { colors } = useTheme();
  const { can } = useSession();
  const data = useAsync(() => getCouponOrders(code), [code]);
  const rows = data.data ?? [];
  const valid = rows.filter((o) => o.status !== 'cancelled');
  const revenue = valid.reduce((n, o) => n + o.total, 0);
  const given = valid.reduce((n, o) => n + o.discount, 0);

  return (
    <>
      <Stack.Screen options={{ title: code }} />
      {data.error && !data.data ? <ErrorState onRetry={data.reload} message={data.error?.message} /> : (
        <FlatList
          style={{ backgroundColor: colors.background }}
          data={data.loading ? [] : rows}
          keyExtractor={(o) => o.id}
          refreshControl={<RefreshControl refreshing={data.refreshing} onRefresh={data.reload} />}
          ListHeaderComponent={
            <View style={{ padding: 16, gap: 10 }}>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <StatTile style={{ flex: 1 }} label="Orders" value={String(valid.length)} note={rows.length > valid.length ? `${rows.length - valid.length} cancelled` : undefined} />
                <StatTile style={{ flex: 1 }} label="Revenue" value={formatPrice(revenue)} />
              </View>
              <StatTile label="Discount given to customers" value={formatPrice(given)} />
              <Text variant="caption" tone="muted" style={{ marginTop: 8 }}>Orders with {code}</Text>
            </View>
          }
          ItemSeparatorComponent={() => <Divider style={{ marginLeft: 16 }} />}
          renderItem={({ item: o }) => (
            <Row onPress={can('orders.view') ? () => router.push({ pathname: '/order/[id]', params: { id: o.id } }) : undefined}
              title={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Text variant="label">{o.order_number}</Text><StatusBadge status={o.status} /></View>}
              subtitle={`${formatDate(o.created_at)} · −${formatPrice(o.discount)} discount`}
              right={<Text variant="label" style={{ fontVariant: ['tabular-nums'] }}>{formatPrice(o.total)}</Text>} />
          )}
          ListEmptyComponent={data.loading ? <View style={{ padding: 16, gap: 10 }}>{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} style={{ height: 50 }} />)}</View>
            : <EmptyState icon="shopping-bag" title="No orders yet" description={`Orders placed with ${code} will appear here.`} />}
        />
      )}
    </>
  );
}
