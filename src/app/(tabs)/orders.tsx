import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Button, Divider, EmptyState, ErrorState, Skeleton, Text } from '@/components/ui';
import { confirm, errorMessage, FilterChips, Pill, Row, SearchField, StatusBadge, useReloadOnFocus, NoAccess } from '@/components/admin';
import { dispatchBatch, getBatchBoard, listOrders, type BatchBoard } from '@/lib/admin';
import { formatBatch, shipCutoff } from '@/lib/ship-batch';
import { useAsync } from '@/lib/use-async';
import { useToast } from '@/providers/toast';
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
  const [batch, setBatch] = useState<string | null>(null);

  const list = usePaged((page) => listOrders({ status: status === 'all' ? null : status, q, page, batch }), [status, q, batch]);
  const board = useAsync(() => getBatchBoard(), []);
  const reload = () => { list.reload(); board.reload(); };
  useReloadOnFocus(reload);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ gap: 10, paddingBottom: 10 }}>
        <View style={{ paddingHorizontal: 16 }}><SearchField value={text} onChangeText={setText} onSubmit={setQ} placeholder="Order number or email" /></View>
        <FilterChips options={OPTIONS} value={status} onChange={(v) => setStatus({ from: params.status, value: v })} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16 }}>
          <Text variant="small" tone="muted" style={{ flex: 1 }}>{list.loading ? 'Loading…' : `${list.total.toLocaleString()} order${list.total === 1 ? '' : 's'}`}</Text>
          {batch ? (
            <Pressable onPress={() => setBatch(null)} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text variant="small" style={{ fontWeight: '700' }}>Batch {formatBatch(batch)}</Text>
              <Feather name="x" size={14} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>
      </View>
      <Divider />
      {list.error && !list.rows.length ? <ErrorState onRetry={list.reload} message={list.error?.message} /> : (
        <FlatList
          data={list.loading ? [] : list.rows}
          keyExtractor={(o) => o.id}
          ItemSeparatorComponent={() => <Divider style={{ marginLeft: 16 }} />}
          refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={reload} />}
          ListHeaderComponent={board.data && !batch ? <Batches board={board.data} onFilter={setBatch} onDispatched={reload} /> : null}
          onEndReached={list.loadMore}
          onEndReachedThreshold={0.4}
          renderItem={({ item: o }) => (
            <Row onPress={() => router.push({ pathname: '/order/[id]', params: { id: o.id } })}
              title={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}><Text variant="label">{o.order_number}</Text><StatusBadge status={o.status} />{o.is_wholesale ? <Pill label="Wholesale" tone="info" /> : null}</View>}
              subtitle={`${o.customer_name ?? o.email} · ${o.item_count} item${o.item_count === 1 ? '' : 's'} · ${formatDate(o.created_at)}${o.ship_date ? ` · ships ${formatBatch(o.ship_date, { day: 'numeric', month: 'short' })}` : ''}`}
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

/** Batch board: the batch due now (dispatch it) and the one the warehouse is filling. */
function Batches({ board, onFilter, onDispatched }: { board: BatchBoard; onFilter: (date: string) => void; onDispatched: () => void }) {
  const { colors } = useTheme();
  const { can } = useSession();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const due = board.ready + board.late > 0;

  async function dispatch() {
    const roll = board.late ? ` ${board.late} order${board.late === 1 ? ' is' : 's are'} not in the warehouse yet and will move to the next batch.` : '';
    if (!(await confirm(`Dispatch the ${formatBatch(board.due)} batch?`, `${board.ready} packed order${board.ready === 1 ? '' : 's'} will be marked as in transit.${roll}`, 'Dispatch', false))) return;
    setBusy(true);
    try {
      const r = await dispatchBatch(board.due);
      toast({ title: `${r.shipped} order${r.shipped === 1 ? '' : 's'} in transit${r.rolled ? `, ${r.rolled} moved to the next batch` : ''}`, tone: 'success' });
      onDispatched();
    } catch (e) {
      toast({ title: errorMessage(e), tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  const card = { borderRadius: 16, borderWidth: 1, padding: 14, gap: 6, backgroundColor: colors.surface } as const;
  return (
    <View style={{ padding: 16, gap: 10 }}>
      {due ? (
        <View style={[card, { borderColor: colors.foreground }]}>
          <Text variant="small" tone="muted" style={{ textTransform: 'uppercase', letterSpacing: 1 }}>Due now</Text>
          <Text variant="label" style={{ fontSize: 17 }}>{formatBatch(board.due)} batch</Text>
          <Text variant="small" tone="muted"><Text variant="small" style={{ fontWeight: '700' }}>{board.ready} packed</Text> ready to leave · <Text variant="small" style={{ fontWeight: '700' }}>{board.late}</Text> not in the warehouse yet</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
            {can('orders.update') ? <Button size="sm" icon="send" title="Dispatch" onPress={dispatch} loading={busy} style={{ flex: 1 }} /> : null}
            <Button size="sm" variant="secondary" title="View orders" onPress={() => onFilter(board.due)} style={{ flex: 1 }} />
          </View>
        </View>
      ) : null}
      <Pressable onPress={() => onFilter(board.upcoming)} style={[card, { borderColor: colors.border }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text variant="small" tone="muted" style={{ flex: 1, textTransform: 'uppercase', letterSpacing: 1 }}>Next shipment</Text>
          <Feather name="chevron-right" size={16} color={colors.subtle} />
        </View>
        <Text variant="label" style={{ fontSize: 17 }}>{formatBatch(board.upcoming)} batch</Text>
        <Text variant="small" tone="muted"><Text variant="small" style={{ fontWeight: '700' }}>{board.packed} packed</Text> in the warehouse · <Text variant="small" style={{ fontWeight: '700' }}>{board.awaiting}</Text> awaiting arrival</Text>
        <Text variant="small" tone="subtle">Orders placed until {formatBatch(shipCutoff(board.upcoming))} join this batch.</Text>
      </Pressable>
    </View>
  );
}
