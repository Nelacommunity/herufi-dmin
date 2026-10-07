import { useState } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Button, Divider, EmptyState, ErrorState, Skeleton, Text } from '@/components/ui';
import { Card, CardTitle, confirm, errorMessage, Pill, Row, SelectSheetTrigger, StatusBadge, Thumb, NoAccess } from '@/components/admin';
import { getOrder, updateOrderStatus } from '@/lib/admin';
import { DELIVERY_LABEL, ORDER_STATUSES, ORDER_STATUS_LABEL } from '@/lib/constants';
import { formatDate, formatPrice } from '@/lib/format';
import type { OrderStatus } from '@/lib/types';
import { useAsync } from '@/lib/use-async';
import { useToast } from '@/providers/toast';
import { useSession } from '@/providers/session';
import { useTheme } from '@/theme';

const FLOW: OrderStatus[] = ['pending', 'confirmed', 'processing', 'shipped', 'delivered'];
const NEXT_HINT: Partial<Record<OrderStatus, string>> = {
  pending: 'Waiting for payment confirmation', confirmed: 'Paid, ready to source', processing: 'Being packed in China',
  shipped: 'On its way to Tanzania', delivered: 'Delivered to the customer', cancelled: 'Cancelled and refunded',
};

export default function OrderDetail() {
  const { can } = useSession();
  return can('orders.view') ? <OrderDetailScreen /> : <NoAccess what="orders" />;
}

function OrderDetailScreen() {
  const { can } = useSession();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const toast = useToast();
  const data = useAsync(() => getOrder(id), [id]);
  const [saving, setSaving] = useState(false);

  if (data.error && !data.data) return <ErrorState onRetry={data.reload} message={data.error?.message} />;
  if (data.loading) return <View style={{ padding: 16, gap: 12 }}><Skeleton style={{ height: 120 }} /><Skeleton style={{ height: 220 }} /><Skeleton style={{ height: 160 }} /></View>;
  if (!data.data) return <EmptyState icon="file" title="Order not found" description="It may have been removed." />;
  const { order, customer } = data.data;
  const a = order.shipping_address;
  const step = FLOW.indexOf(order.status);
  const saved = Number(order.shipping_saved ?? 0);

  async function changeStatus(next: OrderStatus) {
    if (next === order.status) return;
    if (next === 'cancelled' && !(await confirm('Cancel this order?', 'The order is cancelled and the payment is marked as refunded.', 'Cancel order'))) return;
    setSaving(true);
    try {
      await updateOrderStatus(order.id, next, order.status);
      toast({ title: `Order marked as ${ORDER_STATUS_LABEL[next].toLowerCase()}`, tone: 'success' });
      data.reload();
    } catch (e) {
      toast({ title: errorMessage(e), tone: 'error' });
    } finally {
      setSaving(false);
    }
  }

  const phone = a.phone?.replace(/[^\d+]/g, '');
  return (
    <>
      <Stack.Screen options={{ title: order.order_number }} />
      <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={data.refreshing} onRefresh={data.reload} />}>
        <Card style={{ gap: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text variant="small" tone="muted">Placed {formatDate(order.created_at, 'en', 'long')} · updated {formatDate(order.updated_at)}</Text>
              <Text style={{ fontSize: 26, lineHeight: 32, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{formatPrice(order.total)}</Text>
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                <StatusBadge status={order.status} />
                <Pill label={`Payment ${order.payment_status}`} tone={order.payment_status === 'paid' ? 'success' : order.payment_status === 'refunded' || order.payment_status === 'failed' ? 'sale' : 'muted'} />
              </View>
            </View>
          </View>
          {can('orders.update') ? (
            <SelectSheetTrigger label="Order status" value={order.status} onChange={changeStatus}
              options={ORDER_STATUSES.map((s) => ({ value: s, label: ORDER_STATUS_LABEL[s], hint: NEXT_HINT[s] }))}>
              {(open) => <Button title="Change status" icon="refresh-cw" onPress={open} loading={saving} />}
            </SelectSheetTrigger>
          ) : null}
          {order.coupon_code ? (
            <Pressable onPress={() => router.push({ pathname: '/discount/[code]', params: { code: order.coupon_code! } })} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Feather name="tag" size={14} color={colors.muted} />
              <Text variant="small" tone="muted">Discount code <Text variant="small" style={{ fontWeight: '700' }}>{order.coupon_code}</Text></Text>
            </Pressable>
          ) : null}
        </Card>

        {/* Timeline */}
        <Card>
          {order.status === 'cancelled' ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Feather name="x-circle" size={20} color={colors.sale} />
              <Text>This order was cancelled and the payment refunded.</Text>
            </View>
          ) : (
            <View style={{ gap: 0 }}>
              {FLOW.map((s, i) => {
                const done = i <= step;
                return (
                  <View key={s} style={{ flexDirection: 'row', gap: 12 }}>
                    <View style={{ alignItems: 'center' }}>
                      <View style={{ width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: done ? colors.foreground : colors.surface2 }}>
                        {done ? <Feather name="check" size={13} color={colors.background} /> : null}
                      </View>
                      {i < FLOW.length - 1 && <View style={{ width: 2, flex: 1, minHeight: 18, backgroundColor: i < step ? colors.foreground : colors.border }} />}
                    </View>
                    <View style={{ paddingBottom: 14, flex: 1 }}>
                      <Text variant="label" tone={done ? 'default' : 'subtle'}>{ORDER_STATUS_LABEL[s]}</Text>
                      {i === step ? <Text variant="small" tone="muted">{NEXT_HINT[s]}</Text> : null}
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </Card>

        {/* Items & totals */}
        <Card padded={false}>
          <View style={{ padding: 16, paddingBottom: 4 }}><CardTitle title={`Items (${order.items.reduce((n, i) => n + i.quantity, 0)})`} /></View>
          {order.items.map((i) => (
            <Row key={i.id} left={<Thumb uri={i.image_url} size={44} />}
              onPress={i.product_id ? () => router.push({ pathname: '/product/[id]', params: { id: i.product_id! } }) : undefined}
              title={i.product_name} subtitle={[i.variant, `${formatPrice(i.price)} × ${i.quantity}`].filter(Boolean).join(' · ')}
              right={<Text variant="label" style={{ fontVariant: ['tabular-nums'] }}>{formatPrice(i.price * i.quantity)}</Text>} />
          ))}
          <Divider />
          <View style={{ padding: 16, gap: 8 }}>
            <Line label="Subtotal" value={formatPrice(order.subtotal)} />
            {Number(order.discount) > 0 && <Line label={`Discount (${order.coupon_code})`} value={`−${formatPrice(order.discount)}`} tone="success" />}
            <Line label={`Shipping (${DELIVERY_LABEL[order.delivery_method] ?? order.delivery_method})`} value={formatPrice(order.shipping)} note={saved > 0 ? `free, worth ${formatPrice(saved)}` : undefined} />
            <Line label="VAT" value={formatPrice(order.tax)} />
            <Divider style={{ marginVertical: 4 }} />
            <Line label="Total" value={formatPrice(order.total)} bold />
          </View>
        </Card>

        {/* Customer */}
        <Card style={{ gap: 10 }}>
          <CardTitle title="Customer" icon="user" />
          {customer ? (
            <Pressable disabled={!can('customers.view')} onPress={() => router.push({ pathname: '/customer/[id]', params: { id: customer.user_id } })} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text variant="label" style={{ flex: 1, textDecorationLine: 'underline' }}>{customer.full_name ?? customer.email}</Text>
              {customer.status === 'suspended' && <Pill label="Suspended" tone="sale" />}
              <Feather name="chevron-right" size={18} color={colors.subtle} />
            </Pressable>
          ) : <Text tone="muted">Guest checkout</Text>}
          <Text tone="muted">{order.email}</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
            <Button size="sm" variant="secondary" icon="mail" title="Email" style={{ flex: 1 }} onPress={() => Linking.openURL(`mailto:${order.email}?subject=${encodeURIComponent(`Your Herufi order ${order.order_number}`)}`)} />
            {phone ? <Button size="sm" variant="secondary" icon="phone" title="Call" style={{ flex: 1 }} onPress={() => Linking.openURL(`tel:${phone}`)} /> : null}
            {phone ? <Button size="sm" variant="secondary" icon="message-circle" title="WhatsApp" style={{ flex: 1 }} onPress={() => Linking.openURL(`https://wa.me/${phone.replace(/^\+/, '')}`)} /> : null}
          </View>
        </Card>

        <Card style={{ gap: 4 }}>
          <CardTitle title="Shipping address" icon="map-pin" />
          <Text>{a.full_name}</Text>
          <Text tone="muted">{a.line1}{a.line2 ? `, ${a.line2}` : ''}</Text>
          <Text tone="muted">{a.city}{a.region ? `, ${a.region}` : ''} {a.postal_code}</Text>
          <Text tone="muted">{a.country}</Text>
          {a.phone ? <Text tone="muted">{a.phone}</Text> : null}
        </Card>

        <Card style={{ gap: 4 }}>
          <CardTitle title="Payment" icon="credit-card" />
          <Text tone="muted">{order.payment_method?.brand ?? 'Mobile money'}{order.payment_method?.last4 ? ` ending in ${order.payment_method.last4}` : ''}</Text>
          {order.payment_reference ? <Text variant="small" tone="muted" selectable>Snippe reference: {order.payment_reference}</Text> : null}
          <Text>Status: <Text style={{ fontWeight: '700', textTransform: 'capitalize' }}>{order.payment_status}</Text></Text>
        </Card>
      </ScrollView>
    </>
  );
}

function Line({ label, value, tone, bold, note }: { label: string; value: string; tone?: 'success'; bold?: boolean; note?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
      <View style={{ flex: 1 }}>
        <Text tone={bold ? 'default' : 'muted'} style={bold ? { fontWeight: '700', fontSize: 16 } : undefined}>{label}</Text>
        {note ? <Text variant="small" tone="success">{note}</Text> : null}
      </View>
      <Text tone={tone ?? 'default'} style={[{ fontVariant: ['tabular-nums'] }, bold && { fontWeight: '700', fontSize: 16 }]}>{value}</Text>
    </View>
  );
}
