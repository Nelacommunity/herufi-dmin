import { useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Divider, EmptyState, ErrorState, Skeleton, Text } from '@/components/ui';
import { FilterChips, Row, SearchField, StatusBadge, useReloadOnFocus, NoAccess } from '@/components/admin';
import { listOrders } from '@/lib/admin';
import { ORDER_STATUSES, ORDER_STATUS_LABEL } from '@/lib/constants';
import { formatDate, formatPrice } from '@/lib/format';
import type { OrderStatus } from '@/lib/types';
import { usePaged } from '@/lib/use-paged';
import { useSession } from '@/providers/session';
import { useTheme } from '@/theme';

type StatusFilter = OrderStatus | 'all';
const OPTIONS: { value: StatusFilter; label: string }[] = [{ value: 'all', label: 'All' }, ...ORDER_STATUSES.map((s) => ({ value: s, label: ORDER_STATUS_LABEL[s] }))];

export default function Orders() {
  const { can } = useSession();
  return can('orders.view') ? <OrdersScreen /> : <NoAccess what="orders" />;
}

function OrdersScreen() {
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ status?: string }>();
  const initial = (ORDER_STATUSES as string[]).includes(params.status ?? '') ? (params.status as OrderStatus) : 'all';
  // The dashboard can deep-link a status; follow it when it changes.
  const [statusState, setStatus] = useState<{ from?: string; value: StatusFilter }>({ from: params.status, value: initial });
  if (statusState.from !== params.status) setStatus({ from: params.status, value: initial });
  const status = statusState.value;
  const [text, setText] = useState('');
  const [q, setQ] = useState('');

  const list = usePaged((page) => listOrders({ status: status === 'all' ? null : status, q, page }), [status, q]);
  useReloadOnFocus(list.reload);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ gap: 10, paddingBottom: 10 }}>
        <View style={{ paddingHorizontal: 16 }}><SearchField value={text} onChangeText={setText} onSubmit={setQ} placeholder="Order number or email" /></View>
        <FilterChips options={OPTIONS} value={status} onChange={(v) => setStatus({ from: params.status, value: v })} />
        <Text variant="small" tone="muted" style={{ paddingHorizontal: 16 }}>{list.loading ? 'Loading…' : `${list.total.toLocaleString()} order${list.total === 1 ? '' : 's'}`}</Text>
      </View>
      <Divider />
      {list.error && !list.rows.length ? <ErrorState onRetry={list.reload} message={list.error?.message} /> : (
        <FlatList
          data={list.loading ? [] : list.rows}
          keyExtractor={(o) => o.id}
          ItemSeparatorComponent={() => <Divider style={{ marginLeft: 16 }} />}
          refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={list.reload} />}
          onEndReached={list.loadMore}
          onEndReachedThreshold={0.4}
          renderItem={({ item: o }) => (
            <Row onPress={() => router.push({ pathname: '/order/[id]', params: { id: o.id } })}
              title={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Text variant="label">{o.order_number}</Text><StatusBadge status={o.status} /></View>}
              subtitle={`${o.customer_name ?? o.email} · ${o.item_count} item${o.item_count === 1 ? '' : 's'} · ${formatDate(o.created_at)}`}
              right={<Text variant="label" style={{ fontVariant: ['tabular-nums'] }}>{formatPrice(o.total)}</Text>} />
          )}
          ListEmptyComponent={list.loading ? (
            <View style={{ padding: 16, gap: 12 }}>{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} style={{ height: 54 }} />)}</View>
          ) : <EmptyState icon="shopping-cart" title="No orders" description={q || status !== 'all' ? 'Nothing matches these filters.' : 'Orders appear here as customers check out.'} />}
          ListFooterComponent={list.loadingMore ? <ActivityIndicator style={{ margin: 16 }} color={colors.muted} /> : null}
        />
      )}
    </View>
  );
}
