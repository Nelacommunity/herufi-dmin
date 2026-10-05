import { useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Button, ErrorState, Input, Skeleton, Text } from '@/components/ui';
import { Card, errorMessage, SwitchRow, NoAccess } from '@/components/admin';
import { getShippingRates, saveShippingRate } from '@/lib/admin';
import { DELIVERY_LABEL } from '@/lib/constants';
import type { DeliveryMethod, ShippingRate } from '@/lib/types';
import { useAsync } from '@/lib/use-async';
import { useToast } from '@/providers/toast';
import { useSession } from '@/providers/session';
import { useTheme } from '@/theme';

const ICON: Record<DeliveryMethod, keyof typeof Feather.glyphMap> = { standard: 'send', express: 'zap', sea: 'anchor' };

export default function Shipping() {
  const { can } = useSession();
  return can('shipping.manage') ? <ShippingScreen /> : <NoAccess what="shipping rates" />;
}

function ShippingScreen() {
  const { colors } = useTheme();
  const data = useAsync(getShippingRates, []);
  return data.error && !data.data ? (
    <View style={{ flex: 1 }}>
      <ErrorState onRetry={data.reload} message={data.error?.message} />
      <Text tone="muted" style={{ textAlign: 'center', paddingHorizontal: 24 }}>{data.error.message}</Text>
    </View>
  ) : (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={data.refreshing} onRefresh={data.reload} />} keyboardShouldPersistTaps="handled">
      <Text variant="small" tone="muted">
        Cargo rates from China to Tanzania. Air is charged on chargeable weight (actual or volumetric, whichever is higher); sea on packed volume. Each product&apos;s weight, size and allowed methods are set on the product.
      </Text>
      {data.loading ? <Skeleton style={{ height: 300 }} /> : (data.data ?? []).map((r) => <RateForm key={`${r.method}-${r.rate_per_kg}-${r.rate_per_cbm}-${r.free_over}-${r.is_active}`} rate={r} onSaved={data.reload} />)}
    </ScrollView>
  );
}

function RateForm({ rate, onSaved }: { rate: ShippingRate; onSaved: () => void }) {
  const { colors } = useTheme();
  const toast = useToast();
  const byKg = rate.method !== 'sea';
  const [f, setF] = useState({
    rate: String(rate.rate_per_kg ?? rate.rate_per_cbm ?? 0),
    volumetric_kg_per_cbm: String(rate.volumetric_kg_per_cbm),
    min_charge: String(rate.min_charge),
    free_over: rate.free_over == null ? '' : String(rate.free_over),
    free_max_cbm: rate.free_max_cbm == null ? '' : String(rate.free_max_cbm),
    eta_min_days: String(rate.eta_min_days),
    eta_max_days: String(rate.eta_max_days),
  });
  const [active, setActive] = useState(rate.is_active);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof f) => (t: string) => setF({ ...f, [k]: t });
  const num = { keyboardType: 'decimal-pad' as const };

  async function save() {
    setSaving(true);
    try {
      await saveShippingRate({ method: rate.method, ...f, is_active: active });
      toast({ title: `${DELIVERY_LABEL[rate.method]} rates saved`, tone: 'success' });
      onSaved();
    } catch (e) {
      toast({ title: errorMessage(e), tone: 'error' });
    } finally {
      setSaving(false);
    }
  }

  const freeNote = !byKg ? (f.free_over.trim() === '' ? 'Always charged' : Number(f.free_over) === 0 ? 'Free on every order' : `Free over TSh ${Number(f.free_over).toLocaleString('en-US')}`) : null;
  return (
    <Card style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}><Feather name={ICON[rate.method]} size={17} color={colors.foreground} /></View>
        <View style={{ flex: 1 }}>
          <Text variant="h3">{DELIVERY_LABEL[rate.method]}</Text>
          {freeNote ? <Text variant="small" tone={freeNote === 'Always charged' ? 'muted' : 'success'}>{freeNote}</Text> : null}
        </View>
      </View>
      <SwitchRow label="Offered" hint="Shown to customers at checkout" value={active} onValueChange={setActive} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Input label={`Rate, TSh ${byKg ? 'per kg' : 'per m³'}`} value={f.rate} onChangeText={set('rate')} {...num} containerStyle={{ flex: 1 }} />
        <Input label="Min. charge (TSh)" value={f.min_charge} onChangeText={set('min_charge')} {...num} containerStyle={{ flex: 1 }} />
      </View>
      {byKg && <Input label="Volumetric kg per m³" value={f.volumetric_kg_per_cbm} onChangeText={set('volumetric_kg_per_cbm')} {...num} hint="167 = 6000 cm³/kg, 200 = 5000 cm³/kg" />}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Input label="Min days" value={f.eta_min_days} onChangeText={(t) => set('eta_min_days')(t.replace(/\D/g, ''))} keyboardType="number-pad" containerStyle={{ flex: 1 }} />
        <Input label="Max days" value={f.eta_max_days} onChangeText={(t) => set('eta_max_days')(t.replace(/\D/g, ''))} keyboardType="number-pad" containerStyle={{ flex: 1 }} />
      </View>
      {!byKg && (
        <>
          <Input label="Free shipping over (TSh)" value={f.free_over} onChangeText={set('free_over')} {...num} placeholder="Empty = always charged" hint="0 = free on every order · empty = always charged" />
          <Input label="Free up to (m³)" value={f.free_max_cbm} onChangeText={set('free_max_cbm')} {...num} placeholder="No limit" hint="Optional cap for bulky orders" />
        </>
      )}
      <Button title={`Save ${DELIVERY_LABEL[rate.method].toLowerCase()}`} onPress={save} loading={saving} />
    </Card>
  );
}
