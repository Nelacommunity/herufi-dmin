import { useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { router } from 'expo-router';
import { Divider, EmptyState, ErrorState, Skeleton, Text } from '@/components/ui';
import { Avatar, Pill, Row, SearchField, useReloadOnFocus, NoAccess } from '@/components/admin';
import { listCustomers } from '@/lib/admin';
import { formatDate, formatPrice } from '@/lib/format';
import { ROLE_LABEL, type StaffRole } from '@/lib/permissions';
import { useAsync } from '@/lib/use-async';
import { useSession } from '@/providers/session';
import { useTheme } from '@/theme';

export default function Customers() {
  const { can } = useSession();
  return can('customers.view') ? <CustomersScreen /> : <NoAccess what="customers" />;
}

function CustomersScreen() {
  const { colors } = useTheme();
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const data = useAsync(() => listCustomers(q), [q]);
  useReloadOnFocus(data.reload);
  const rows = data.data?.rows ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ gap: 10, paddingBottom: 10, paddingHorizontal: 16 }}>
        <SearchField value={text} onChangeText={setText} onSubmit={setQ} placeholder="Search name or email" />
        <Text variant="small" tone="muted">
          {data.loading ? 'Loading…' : `${(data.data?.total ?? 0).toLocaleString()} registered account${data.data?.total === 1 ? '' : 's'}${(data.data?.total ?? 0) > rows.length ? ` · showing newest ${rows.length}` : ''}`}
        </Text>
      </View>
      <Divider />
      {data.error && !data.data ? <ErrorState onRetry={data.reload} message={data.error?.message} /> : (
        <FlatList
          data={data.loading ? [] : rows}
          keyExtractor={(c) => c.user_id}
          ItemSeparatorComponent={() => <Divider style={{ marginLeft: 68 }} />}
          refreshControl={<RefreshControl refreshing={data.refreshing} onRefresh={data.reload} />}
          renderItem={({ item: c }) => (
            <Row onPress={() => router.push({ pathname: '/customer/[id]', params: { id: c.user_id } })}
              left={<Avatar name={c.full_name} email={c.email} />}
              title={
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text variant="label" numberOfLines={1} style={{ flexShrink: 1 }}>{c.full_name ?? '—'}</Text>
                  {c.role !== 'customer' && <Pill label={ROLE_LABEL[c.role as StaffRole] ?? c.role} tone="dark" />}
                  {c.status === 'suspended' && <Pill label="Suspended" tone="sale" />}
                </View>
              }
              subtitle={`${c.email ?? ''} · joined ${formatDate(c.created_at)}`}
              right={
                <View style={{ alignItems: 'flex-end' }}>
                  <Text variant="label" style={{ fontVariant: ['tabular-nums'] }}>{formatPrice(c.spent)}</Text>
                  <Text variant="small" tone="muted">{c.orders} order{c.orders === 1 ? '' : 's'}</Text>
                </View>
              } />
          )}
          ListEmptyComponent={data.loading ? (
            <View style={{ padding: 16, gap: 12 }}>{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} style={{ height: 52 }} />)}</View>
          ) : <EmptyState icon="users" title="No customers" description={q ? 'Nobody matches that search.' : 'Accounts appear here when people sign up.'} />}
        />
      )}
    </View>
  );
}
