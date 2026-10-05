import { useState } from 'react';
import { ActivityIndicator, FlatList, Linking, Pressable, RefreshControl, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Button, Divider, EmptyState, ErrorState, IconButton, Input, Sheet, Skeleton, Text } from '@/components/ui';
import { errorMessage, FilterChips, Pill, Row, SearchField, Thumb, useReloadOnFocus, NoAccess } from '@/components/admin';
import { adjustStock, listProducts, setProductActive, type ProductFilter, type ProductRow } from '@/lib/admin';
import { LOW_STOCK, SITE } from '@/lib/constants';
import { formatPrice } from '@/lib/format';
import { usePaged } from '@/lib/use-paged';
import { useToast } from '@/providers/toast';
import { useSession } from '@/providers/session';
import { radius, useTheme } from '@/theme';

const FILTERS: { value: ProductFilter; label: string }[] = [
  { value: 'all', label: 'All' }, { value: 'active', label: 'Active' }, { value: 'draft', label: 'Draft' }, { value: 'low', label: 'Low stock' }, { value: 'sale', label: 'On sale' },
];

export default function Products() {
  const { can } = useSession();
  return (can('products.create') || can('products.edit') || can('products.delete') || can('questions.answer')) ? <ProductsScreen /> : <NoAccess what="products" />;
}

function ProductsScreen() {
  const { colors } = useTheme();
  const { can } = useSession();
  const toast = useToast();
  const params = useLocalSearchParams<{ filter?: string }>();
  const initial = (FILTERS.map((f) => f.value) as string[]).includes(params.filter ?? '') ? (params.filter as ProductFilter) : 'all';
  const [filterState, setFilter] = useState<{ from?: string; value: ProductFilter }>({ from: params.filter, value: initial });
  if (filterState.from !== params.filter) setFilter({ from: params.filter, value: initial });
  const filter = filterState.value;
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [menu, setMenu] = useState<ProductRow | null>(null);
  const [stockFor, setStockFor] = useState<ProductRow | null>(null);
  const [stock, setStock] = useState('');
  const [busy, setBusy] = useState(false);

  const list = usePaged((page) => listProducts({ q, filter, page }), [q, filter]);
  useReloadOnFocus(list.reload);

  async function togglePublish(p: ProductRow) {
    setMenu(null);
    try {
      await setProductActive(p.id, !p.is_active);
      list.setRows((rows) => rows.map((r) => (r.id === p.id ? { ...r, is_active: !p.is_active } : r)));
      toast({ title: p.is_active ? 'Moved to drafts' : 'Published', tone: 'success' });
    } catch (e) {
      toast({ title: errorMessage(e), tone: 'error' });
    }
  }

  async function saveStock() {
    if (!stockFor) return;
    const n = Number(stock);
    setBusy(true);
    try {
      await adjustStock(stockFor.id, n);
      list.setRows((rows) => rows.map((r) => (r.id === stockFor.id ? { ...r, stock_quantity: n } : r)));
      toast({ title: 'Stock updated', tone: 'success' });
      setStockFor(null);
    } catch (e) {
      toast({ title: errorMessage(e), tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ gap: 10, paddingBottom: 10 }}>
        <View style={{ paddingHorizontal: 16, flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <View style={{ flex: 1 }}><SearchField value={text} onChangeText={setText} onSubmit={setQ} placeholder="Name, brand or SKU" /></View>
          {can('products.create') && <Pressable onPress={() => router.push({ pathname: '/product/[id]', params: { id: 'new' } })} accessibilityLabel="Add product"
            style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.foreground, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}>
            <Feather name="plus" size={22} color={colors.background} />
          </Pressable>}
        </View>
        <FilterChips options={FILTERS} value={filter} onChange={(v) => setFilter({ from: params.filter, value: v })} />
        <Text variant="small" tone="muted" style={{ paddingHorizontal: 16 }}>{list.loading ? 'Loading…' : `${list.total.toLocaleString()} product${list.total === 1 ? '' : 's'}`}</Text>
      </View>
      <Divider />
      {list.error && !list.rows.length ? <ErrorState onRetry={list.reload} message={list.error?.message} /> : (
        <FlatList
          data={list.loading ? [] : list.rows}
          keyExtractor={(p) => p.id}
          ItemSeparatorComponent={() => <Divider style={{ marginLeft: 80 }} />}
          refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={list.reload} />}
          onEndReached={list.loadMore}
          onEndReachedThreshold={0.4}
          renderItem={({ item: p }) => (
            <Row chevron={false} onPress={() => router.push({ pathname: '/product/[id]', params: { id: p.id } })}
              left={<Thumb uri={p.image} size={48} />}
              title={p.name}
              subtitle={
                <View style={{ gap: 4 }}>
                  <Text variant="small" tone="muted" numberOfLines={1}>{[p.brand, p.category].filter(Boolean).join(' · ') || 'Uncategorised'}</Text>
                  <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Pill label={p.is_active ? 'Active' : 'Draft'} tone={p.is_active ? 'success' : 'muted'} />
                    {p.is_featured && <Pill label="Featured" />}
                    <Text variant="small" style={{ color: p.stock_quantity === 0 ? colors.sale : p.stock_quantity < LOW_STOCK ? colors.warning : colors.muted, fontWeight: p.stock_quantity < LOW_STOCK ? '700' : '400' }}>
                      {p.stock_quantity === 0 ? 'Out of stock' : `${p.stock_quantity} in stock`}{p.variant_count ? ` · ${p.variant_count} variants` : ''}
                    </Text>
                  </View>
                </View>
              }
              right={
                <View style={{ alignItems: 'flex-end', gap: 2 }}>
                  <Text variant="label" style={{ fontVariant: ['tabular-nums'] }}>{formatPrice(p.price)}</Text>
                  {p.compare_at_price ? <Text variant="small" tone="subtle" style={{ textDecorationLine: 'line-through' }}>{formatPrice(p.compare_at_price)}</Text> : null}
                  <IconButton name="more-horizontal" label={`Actions for ${p.name}`} size={18} onPress={() => setMenu(p)} style={{ width: 32, height: 28 }} />
                </View>
              } />
          )}
          ListEmptyComponent={list.loading ? (
            <View style={{ padding: 16, gap: 12 }}>{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} style={{ height: 60 }} />)}</View>
          ) : <EmptyState icon="package" title="No products" description={q || filter !== 'all' ? 'Nothing matches. Try another search or filter.' : 'Add your first product.'}
            action={can('products.create') ? <Button title="Add product" icon="plus" onPress={() => router.push({ pathname: '/product/[id]', params: { id: 'new' } })} /> : undefined} />}
          ListFooterComponent={list.loadingMore ? <ActivityIndicator style={{ margin: 16 }} color={colors.muted} /> : null}
        />
      )}

      <Sheet visible={menu !== null} onClose={() => setMenu(null)} title={menu?.name ?? ''}>
        {menu ? (
          <View style={{ padding: 8 }}>
            <Action icon="edit-2" label={can('products.edit') ? 'Edit product' : 'Open product'} onPress={() => { setMenu(null); router.push({ pathname: '/product/[id]', params: { id: menu.id } }); }} />
            {can('products.edit') && <Action icon={menu.is_active ? 'eye-off' : 'eye'} label={menu.is_active ? 'Unpublish (move to drafts)' : 'Publish'} onPress={() => togglePublish(menu)} />}
            {can('products.edit') && menu.variant_count === 0 && (
              <Action icon="layers" label="Adjust stock" onPress={() => { setStock(String(menu.stock_quantity)); setStockFor(menu); setMenu(null); }} />
            )}
            {menu.is_active && <Action icon="external-link" label="View in store" onPress={() => { setMenu(null); Linking.openURL(`${SITE.url}/products/${menu.slug}`); }} />}
          </View>
        ) : null}
      </Sheet>

      <Sheet visible={stockFor !== null} onClose={() => setStockFor(null)} title="Adjust stock"
        footer={<Button size="lg" title="Save stock" onPress={saveStock} loading={busy} disabled={!/^\d+$/.test(stock)} />}>
        <View style={{ padding: 20, gap: 14 }}>
          <Text tone="muted" numberOfLines={2}>{stockFor?.name}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Pressable onPress={() => setStock(String(Math.max(0, (Number(stock) || 0) - 1)))} style={{ width: 50, height: 50, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' }}><Feather name="minus" size={20} color={colors.foreground} /></Pressable>
            <Input value={stock} onChangeText={(s) => setStock(s.replace(/\D/g, ''))} keyboardType="number-pad" containerStyle={{ flex: 1 }} style={{ textAlign: 'center', fontSize: 20, fontWeight: '700' }} />
            <Pressable onPress={() => setStock(String((Number(stock) || 0) + 1))} style={{ width: 50, height: 50, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' }}><Feather name="plus" size={20} color={colors.foreground} /></Pressable>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[10, 25, 50, 100].map((n) => <Button key={n} size="sm" variant="secondary" title={`+${n}`} style={{ flex: 1 }} onPress={() => setStock(String((Number(stock) || 0) + n))} />)}
          </View>
        </View>
      </Sheet>
    </View>
  );
}

function Action({ icon, label, onPress }: { icon: keyof typeof Feather.glyphMap; label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 15, borderRadius: radius.md, backgroundColor: pressed ? colors.surface2 : 'transparent' })}>
      <Feather name={icon} size={19} color={colors.foreground} />
      <Text>{label}</Text>
    </Pressable>
  );
}
