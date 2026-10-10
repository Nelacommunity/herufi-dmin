import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Divider, EmptyState, ErrorState, IconButton, Input, Sheet, Skeleton, Text } from '@/components/ui';
import { Card, CardTitle, confirm, errorMessage, Pill, SelectCircle, SelectField, SelectionBar, SwitchRow, useSelection } from '@/components/admin';
import { bulkDelete, couponState, deleteCoupon, listCoupons, listStaff, saveCoupon, type Coupon, type StaffMember } from '@/lib/admin';
import { useSession } from '@/providers/session';
import { formatDate, formatPrice } from '@/lib/format';
import { useAsync } from '@/lib/use-async';
import { useToast } from '@/providers/toast';
import { radius, useTheme } from '@/theme';

export default function Discounts() {
  const { colors } = useTheme();
  const toast = useToast();
  const { can, isSuper, profile } = useSession();
  const insets = useSafeAreaInsets();
  // Bulk delete: super admins only (admin_bulk_delete() enforces this in the database too).
  const sel = useSelection();
  const [deleting, setDeleting] = useState(false);
  const manage = can('discounts.manage');
  const data = useAsync(async () => {
    const [coupons, staff] = await Promise.all([listCoupons(), isSuper ? listStaff() : Promise.resolve([] as StaffMember[])]);
    return { coupons, staff };
  }, [isSuper]);
  const [editing, setEditing] = useState<Coupon | 'new' | null>(null);
  // Super admins edit any code; admins with discounts.manage only codes assigned to them (RLS enforces the same).
  const editable = (c: Coupon) => manage && (isSuper || c.assigned_admin_id === profile?.user_id);

  async function remove(c: Coupon) {
    if (!(await confirm(`Delete ${c.code}?`, 'Customers will no longer be able to use this code.', 'Delete'))) return;
    try { await deleteCoupon(c.id); toast({ title: 'Discount deleted', tone: 'success' }); data.reload(); }
    catch (e) { toast({ title: errorMessage(e), tone: 'error' }); }
  }

  const coupons = data.data?.coupons ?? [];

  async function deleteSelected() {
    const n = sel.count;
    if (!(await confirm(`Delete ${n} discount code${n === 1 ? '' : 's'}?`, "Customers can no longer use them, and their sales drop out of the staff sales report. Past orders still show the code. This can't be undone.", 'Delete'))) return;
    setDeleting(true);
    try {
      const done = await bulkDelete('coupons', [...sel.ids]);
      toast({ title: `Deleted ${done} discount code${done === 1 ? '' : 's'}`, tone: 'success' });
      sel.clear();
      data.reload();
    } catch (e) {
      toast({ title: errorMessage(e), tone: 'error' });
    } finally {
      setDeleting(false);
    }
  }
  // Sales credited to each staff member through their codes.
  const byStaff = new Map<string, { name: string; orders: number; revenue: number; codes: number }>();
  for (const c of coupons) {
    const key = c.assigned_admin_id ?? 'none';
    const st = byStaff.get(key) ?? { name: c.assigned_admin_id === profile?.user_id ? 'You' : c.stats.assigned_admin_name ?? 'Unassigned', orders: 0, revenue: 0, codes: 0 };
    st.orders += c.stats.orders; st.revenue += c.stats.revenue; st.codes++;
    byStaff.set(key, st);
  }
  const leaderboard = [...byStaff.values()].sort((a, b) => b.revenue - a.revenue);
  return (
    <>
      <Stack.Screen options={{ headerRight: manage || isSuper ? () => (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {isSuper && !sel.active && coupons.length > 0 && <Pressable onPress={() => sel.start()} hitSlop={8} style={{ paddingHorizontal: 10 }}><Text style={{ fontWeight: '700' }}>Select</Text></Pressable>}
          {manage && !sel.active && <IconButton name="plus" label="Create discount" onPress={() => setEditing('new')} />}
        </View>
      ) : undefined }} />
      {data.error && !data.data ? <ErrorState onRetry={data.reload} message={data.error?.message} /> : (
        <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={data.refreshing} onRefresh={data.reload} />}>
          <Text variant="small" tone="muted">{manage
            ? 'Each code is assigned to a staff member, so you can see the orders and revenue it brings in.'
            : 'Your discount codes and the orders customers placed with them.'}</Text>
          {manage && leaderboard.length > 1 && (
            <Card style={{ gap: 10 }}>
              <CardTitle title="Sales by staff" icon="award" />
              {leaderboard.map((st) => (
                <View key={st.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text style={{ flex: 1 }} numberOfLines={1}>{st.name}</Text>
                  <Text variant="small" tone="muted">{st.orders} orders · {st.codes} code{st.codes === 1 ? '' : 's'}</Text>
                  <Text variant="label" style={{ fontVariant: ['tabular-nums'], minWidth: 90, textAlign: 'right' }}>{formatPrice(st.revenue)}</Text>
                </View>
              ))}
            </Card>
          )}
          {data.loading ? <Skeleton style={{ height: 240 }} /> : coupons.length ? (
            <Card padded={false}>
              {coupons.map((c, i) => {
                const s = couponState(c);
                return (
                  <View key={c.id}>
                    {i > 0 && <Divider />}
                    <Pressable onPress={() => (sel.active ? sel.toggle(c.id) : editable(c) ? setEditing(c) : router.push({ pathname: '/discount/[code]', params: { code: c.code } }))}
                      onLongPress={isSuper && !sel.active ? () => sel.start(c.id) : undefined} delayLongPress={350}
                      style={({ pressed }) => ({ padding: 14, gap: 6, backgroundColor: pressed || (sel.active && sel.has(c.id)) ? colors.surface2 : 'transparent' })}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        {sel.active && <SelectCircle selected={sel.has(c.id)} />}
                        <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderStrong }}>
                          <Text style={{ fontFamily: 'monospace', fontWeight: '700', letterSpacing: 0.5 }}>{c.code}</Text>
                        </View>
                        <Pill label={s.label} tone={s.tone} />
                        <View style={{ flex: 1 }} />
                        {editable(c) && !sel.active && <IconButton name="trash-2" label={`Delete ${c.code}`} size={17} color={colors.sale} onPress={() => remove(c)} style={{ width: 32, height: 32 }} />}
                      </View>
                      <Text variant="label">{c.type === 'percentage' ? `${c.value}% off` : `${formatPrice(c.value)} off`}{c.min_subtotal > 0 ? <Text tone="muted" variant="small">{`  ·  min. ${formatPrice(c.min_subtotal)}`}</Text> : null}</Text>
                      {c.description ? <Text variant="small" tone="muted">{c.description}</Text> : null}
                      <Text variant="small" tone="subtle">
                        {c.assigned_admin_id === profile?.user_id ? 'Yours' : c.stats.assigned_admin_name ? `Assigned to ${c.stats.assigned_admin_name}` : 'Unassigned'} · {c.usage_limit ? `${c.used_count}/${c.usage_limit} used · ` : ''}{c.expires_at ? `expires ${formatDate(c.expires_at)}` : 'never expires'}
                      </Text>
                      <Pressable onPress={() => router.push({ pathname: '/discount/[code]', params: { code: c.code } })} hitSlop={6}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4, padding: 10, borderRadius: radius.md, backgroundColor: colors.surface2 }}>
                        <Text variant="small" style={{ flex: 1 }}><Text variant="small" style={{ fontWeight: '700' }}>{c.stats.orders}</Text> order{c.stats.orders === 1 ? '' : 's'} · <Text variant="small" style={{ fontWeight: '700' }}>{formatPrice(c.stats.revenue)}</Text></Text>
                        <Text variant="small" style={{ fontWeight: '700' }}>View orders ›</Text>
                      </Pressable>
                    </Pressable>
                  </View>
                );
              })}
            </Card>
          ) : <EmptyState icon="percent" title="No discount codes" description={manage ? 'Create a code customers can enter at checkout.' : 'No codes are assigned to you yet.'}
            action={manage ? <Button title="Create discount" icon="plus" onPress={() => setEditing('new')} /> : undefined} />}
        </ScrollView>
      )}
      {sel.active && (
        <SelectionBar count={sel.count} total={coupons.length} allSelected={coupons.length > 0 && coupons.every((c) => sel.has(c.id))}
          onSelectAll={() => sel.setAll(coupons.map((c) => c.id))} onCancel={sel.clear} onDelete={deleteSelected} busy={deleting} bottomInset={insets.bottom} />
      )}
      <Sheet visible={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Create discount' : 'Edit discount'}>
        {editing !== null ? <CouponForm key={editing === 'new' ? 'new' : editing.id} coupon={editing === 'new' ? null : editing} staff={data.data?.staff ?? []} onDone={() => { setEditing(null); data.reload(); }} /> : null}
      </Sheet>
    </>
  );
}

function CouponForm({ coupon, staff, onDone }: { coupon: Coupon | null; staff: StaffMember[]; onDone: () => void }) {
  const { colors } = useTheme();
  const { isSuper, profile } = useSession();
  const me = profile?.user_id ?? '';
  const [assignee, setAssignee] = useState(coupon?.assigned_admin_id ?? me);
  const toast = useToast();
  const [code, setCode] = useState(coupon?.code ?? '');
  const [description, setDescription] = useState(coupon?.description ?? '');
  const [type, setType] = useState<'percentage' | 'fixed'>(coupon?.type ?? 'percentage');
  const [value, setValue] = useState(coupon ? String(coupon.value) : '');
  const [min, setMin] = useState(coupon ? String(coupon.min_subtotal) : '0');
  const [limit, setLimit] = useState(coupon?.usage_limit != null ? String(coupon.usage_limit) : '');
  const [expires, setExpires] = useState(coupon?.expires_at?.slice(0, 10) ?? '');
  const [active, setActive] = useState(coupon?.is_active ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Quick expiry presets are friendlier than typing dates on a phone.
  const inDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

  async function save() {
    setError(null);
    setSaving(true);
    try {
      await saveCoupon({ id: coupon?.id, code, description, type, value, min_subtotal: min, usage_limit: limit, expires_at: expires, is_active: active, assigned_admin_id: isSuper ? assignee : me });
      toast({ title: coupon ? 'Discount updated' : 'Discount created', tone: 'success' });
      onDone();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }} keyboardShouldPersistTaps="handled">
      <Input label="Code" value={code} onChangeText={(t) => setCode(t.toUpperCase().replace(/\s/g, ''))} autoCapitalize="characters" autoCorrect={false} hint="Customers enter this at checkout." style={{ fontFamily: 'monospace', fontWeight: '700' }} />
      {isSuper ? (
        <SelectField label="Assigned to" value={assignee} onChange={(v) => setAssignee(v || me)}
          options={staff.map((s) => ({ value: s.user_id, label: `${s.user_id === me ? 'Me' : s.full_name ?? s.email ?? 'Staff'}${s.role === 'super_admin' ? ' · super admin' : ''}` }))} />
      ) : (
        <Text variant="small" tone="muted" style={{ padding: 12, borderRadius: radius.md, backgroundColor: colors.surface2 }}>This code is assigned to you. Orders placed with it count towards your sales.</Text>
      )}
      <Input label="Description" value={description} onChangeText={setDescription} placeholder="Optional" />
      <View style={{ gap: 6 }}>
        <Text variant="label">Type</Text>
        <View style={{ flexDirection: 'row', padding: 3, borderRadius: radius.full, backgroundColor: colors.surface2 }}>
          {(['percentage', 'fixed'] as const).map((t) => (
            <Pressable key={t} onPress={() => setType(t)} style={[{ flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: radius.full }, type === t && { backgroundColor: colors.surface, boxShadow: '0 1px 3px rgba(0,0,0,0.12)' }]}>
              <Text variant="small" style={{ fontWeight: '700', color: type === t ? colors.foreground : colors.muted }}>{t === 'percentage' ? 'Percentage' : 'Fixed amount'}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Input label={type === 'percentage' ? 'Percent off' : 'Amount off (TSh)'} value={value} onChangeText={setValue} keyboardType="decimal-pad" containerStyle={{ flex: 1 }} />
        <Input label="Min. spend (TSh)" value={min} onChangeText={setMin} keyboardType="decimal-pad" containerStyle={{ flex: 1 }} />
      </View>
      <Input label="Usage limit" value={limit} onChangeText={(t) => setLimit(t.replace(/\D/g, ''))} keyboardType="number-pad" placeholder="Unlimited" />
      <View style={{ gap: 8 }}>
        <Input label="Expires on" value={expires} onChangeText={setExpires} placeholder="Never (or YYYY-MM-DD)" autoCapitalize="none" keyboardType="numbers-and-punctuation" />
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          {[['1 week', 7], ['1 month', 30], ['3 months', 90]].map(([l, n]) => <Button key={l} size="sm" variant="secondary" title={String(l)} onPress={() => setExpires(inDays(Number(n)))} />)}
          {expires ? <Button size="sm" variant="ghost" title="Never" onPress={() => setExpires('')} /> : null}
        </View>
      </View>
      <SwitchRow label="Active" hint="Inactive codes are rejected at checkout" value={active} onValueChange={setActive} />
      {error ? <Text tone="sale">{error}</Text> : null}
      <Button size="lg" title="Save discount" onPress={save} loading={saving} />
    </ScrollView>
  );
}
