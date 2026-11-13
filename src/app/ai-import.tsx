import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Button, Text } from '@/components/ui';
import { Card, errorMessage, NoAccess, SelectField, SwitchRow } from '@/components/admin';
import { aiImport, listCategories, saveProduct, type AiDraft, type AiImportResult } from '@/lib/admin';
import { formatPrice } from '@/lib/format';
import type { Category } from '@/lib/types';
import { useAsync } from '@/lib/use-async';
import { useSession } from '@/providers/session';
import { useToast } from '@/providers/toast';
import { radius, useTheme } from '@/theme';

type Shot = { uri: string; mimeType?: string | null; fileName?: string | null };
type Row = AiDraft & { key: number; stock: string; publish: boolean; status: 'draft' | 'saving' | 'saved'; savedId?: string };

export default function AiImport() {
  const { can } = useSession();
  return can('products.create') ? <AiImportScreen /> : <NoAccess what="AI import" />;
}

/** Screenshots from Pinduoduo → AI-read drafts priced in TSh → products. */
function AiImportScreen() {
  const { colors } = useTheme();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const cats = useAsync(listCategories, []);
  const [shots, setShots] = useState<Shot[]>([]);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ pricing: AiImportResult['pricing']; rows: Row[] } | null>(null);

  async function pick() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 8 - shots.length, quality: 0.9 });
    if (!res.canceled) setShots([...shots, ...res.assets.map((a) => ({ uri: a.uri, mimeType: a.mimeType, fileName: a.fileName }))].slice(0, 8));
  }

  async function read() {
    setReading(true); setError(null); setResult(null);
    try {
      const r = await aiImport(shots);
      setResult({ pricing: r.pricing, rows: r.products.map((p, i) => ({ ...p, key: i, stock: String(p.variants[0]?.stock_quantity ?? p.stock_quantity), publish: false, status: 'draft' })) });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setReading(false);
    }
  }

  const update = (key: number, patch: Partial<Row>) => setResult((r) => r && { ...r, rows: r.rows.map((x) => (x.key === key ? { ...x, ...patch } : x)) });

  async function create(row: Row) {
    const stock = Math.max(0, Math.floor(Number(row.stock) || 0));
    update(row.key, { status: 'saving' });
    try {
      const id = await saveProduct({
        name: row.name, slug: row.slug, brand: '', category_id: row.category_id, description: row.description,
        details: row.details, specifications: row.specifications, price: row.price, compare_at_price: row.compare_at_price,
        sale_mode: 'retail', wholesale_price: null, wholesale_min_qty: 10,
        sku: null, stock_quantity: stock, is_featured: false, is_active: row.publish,
        weight_kg: row.weight_kg, length_cm: row.length_cm, width_cm: row.width_cm, height_cm: row.height_cm,
        shipping_methods: ['sea', 'standard', 'express'],
        images: row.images,
        variants: row.variants.map((v) => ({ ...v, stock_quantity: stock })),
      });
      update(row.key, { status: 'saved', savedId: id });
      toast({ title: row.publish ? `${row.name} is live` : `${row.name} saved as a draft`, tone: 'success' });
    } catch (e) {
      update(row.key, { status: 'draft' });
      toast({ title: errorMessage(e), tone: 'error' });
    }
  }

  const categories: Category[] = cats.data ?? [];
  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
      <Text tone="muted">Pick screenshots from Pinduoduo (or another Chinese shop). AI reads the product and converts ¥ to TSh at today&apos;s rate × 3. You check the draft before it&apos;s created.</Text>

      <Card style={{ gap: 12 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {shots.map((s, i) => (
            <View key={s.uri} style={[styles.shot, { backgroundColor: colors.surface2 }]}>
              <Image source={s.uri} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="top" />
              <Pressable onPress={() => setShots(shots.filter((_, j) => j !== i))} accessibilityLabel={`Remove screenshot ${i + 1}`} style={styles.remove}>
                <Feather name="x" size={13} color="#fff" />
              </Pressable>
            </View>
          ))}
          {shots.length < 8 && (
            <Pressable onPress={pick} style={[styles.shot, styles.add, { borderColor: colors.borderStrong }]}>
              <Feather name="image" size={20} color={colors.muted} />
              <Text variant="small" tone="muted">Add</Text>
            </Pressable>
          )}
        </ScrollView>
        <Text variant="small" tone="muted">Up to 8. Include the page with the price and the options list. For clean photos, open the product photo full screen and screenshot it too.</Text>
        <Button title={reading ? 'Reading…' : 'Read with AI'} icon="zap" onPress={read} loading={reading} disabled={!shots.length} />
        {reading && <Text variant="small" tone="muted" style={{ textAlign: 'center' }}>This can take up to a minute.</Text>}
        {error && <Text tone="sale">{error}</Text>}
      </Card>

      {result && (
        <>
          <Text variant="small" tone="muted">
            ¥1 = TSh {result.pricing.rate.toFixed(2)} ({result.pricing.rateSource === 'live' ? 'live' : 'fallback'} rate) × {result.pricing.multiplier}. {result.rows.length} product{result.rows.length === 1 ? '' : 's'} found.
          </Text>
          {result.rows.map((row) => (
            <Card key={row.key} style={{ gap: 12, borderColor: row.status === 'saved' ? colors.success : colors.border }}>
              {row.warnings.map((w) => (
                <View key={w} style={[styles.warn, { backgroundColor: /counterfeit|brand/i.test(w) ? colors.saleSoft : colors.surface2 }]}>
                  <Feather name="alert-triangle" size={14} color={/counterfeit|brand/i.test(w) ? colors.sale : colors.muted} style={{ marginTop: 2 }} />
                  <Text variant="small" style={{ flex: 1, color: /counterfeit|brand/i.test(w) ? colors.sale : colors.muted }}>{w}</Text>
                </View>
              ))}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                {row.images.map((img, i) => (
                  <View key={img.image_url} style={[styles.photo, { backgroundColor: colors.surface2 }]}>
                    <Image source={img.image_url} style={StyleSheet.absoluteFill} contentFit="cover" />
                    {i === 0 && <View style={[styles.cover, { backgroundColor: colors.foreground }]}><Text style={{ color: colors.background, fontSize: 9, fontWeight: '700' }}>COVER</Text></View>}
                  </View>
                ))}
              </ScrollView>
              <Field label="Name"><TextInput value={row.name} onChangeText={(t) => update(row.key, { name: t })} style={[styles.input, { borderColor: colors.borderStrong, color: colors.foreground }]} /></Field>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Field label="Price (TSh)" style={{ flex: 1 }}>
                  <TextInput value={String(row.price)} keyboardType="number-pad" onChangeText={(t) => update(row.key, { price: Number(t.replace(/\D/g, '')) || 0 })} style={[styles.input, { borderColor: colors.borderStrong, color: colors.foreground }]} />
                </Field>
                <Field label={row.variants.length ? 'Stock per option' : 'Stock'} style={{ flex: 1 }}>
                  <TextInput value={row.stock} keyboardType="number-pad" onChangeText={(t) => update(row.key, { stock: t.replace(/\D/g, '') })} style={[styles.input, { borderColor: colors.borderStrong, color: colors.foreground }]} />
                </Field>
              </View>
              <Text variant="small" tone="muted">¥{row.source.price_cny} × {result.pricing.rate.toFixed(2)} × {result.pricing.multiplier}{row.compare_at_price ? ` · was ${formatPrice(row.compare_at_price)}` : ''}</Text>
              <SelectField label="Category" value={row.category_id ?? ''} onChange={(v) => update(row.key, { category_id: v || null })}
                options={[{ value: '', label: 'Uncategorised' }, ...categories.map((c) => ({ value: c.id, label: c.name }))]} />
              <Text tone="muted">{row.description}</Text>
              {row.variants.length > 0 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {row.variants.map((v) => (
                    <View key={v.value} style={[styles.chip, { backgroundColor: colors.surface2 }]}>
                      <Text variant="small">{v.value}{v.additional_price > 0 ? ` +${formatPrice(v.additional_price)}` : ''}</Text>
                    </View>
                  ))}
                </View>
              )}
              <Text variant="small" tone="subtle">Shipping estimate: {row.weight_kg} kg · {row.length_cm}×{row.width_cm}×{row.height_cm} cm</Text>
              {row.status === 'saved' ? (
                <Button variant="secondary" icon="edit-2" title="Open in editor" onPress={() => router.push({ pathname: '/product/[id]', params: { id: row.savedId! } })} />
              ) : (
                <>
                  <SwitchRow label="Publish immediately" hint="Off = saved as a draft for you to finish" value={row.publish} onValueChange={(v) => update(row.key, { publish: v })} />
                  <Button title={row.publish ? 'Create and publish' : 'Create as draft'} icon="check" onPress={() => create(row)} loading={row.status === 'saving'} disabled={!row.name.trim() || row.price <= 0} />
                </>
              )}
            </Card>
          ))}
        </>
      )}
      {cats.loading && <ActivityIndicator color={colors.muted} />}
    </ScrollView>
  );
}

function Field({ label, children, style }: { label: string; children: React.ReactNode; style?: object }) {
  return (
    <View style={[{ gap: 6 }, style]}>
      <Text variant="label">{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  shot: { width: 70, height: 140, borderRadius: radius.sm, overflow: 'hidden' },
  add: { borderWidth: 2, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 4 },
  remove: { position: 'absolute', right: 4, top: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  warn: { flexDirection: 'row', gap: 8, padding: 10, borderRadius: radius.md },
  photo: { width: 84, height: 84, borderRadius: radius.sm, overflow: 'hidden' },
  cover: { position: 'absolute', left: 4, top: 4, paddingHorizontal: 4, borderRadius: 4 },
  input: { height: 46, borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 12, fontSize: 15 },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.full },
});
