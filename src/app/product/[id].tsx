import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Button, EmptyState, ErrorState, IconButton, Input, Skeleton, Text } from '@/components/ui';
import { Card, CardTitle, confirm, errorMessage, NoAccess, SelectField, SwitchRow } from '@/components/admin';
import { useSession } from '@/providers/session';
import {
  answerQuestion, deleteProduct, getProduct, getProductQuestions, listCategories, saveProduct, slugify, uploadImage, type ProductPayload,
} from '@/lib/admin';
import { DELIVERY_LABEL, DELIVERY_METHODS, SITE } from '@/lib/constants';
import { formatRelative } from '@/lib/format';
import type { Category, DeliveryMethod, Product, ProductQuestion } from '@/lib/types';
import { useAsync } from '@/lib/use-async';
import { useToast } from '@/providers/toast';
import { radius, useTheme } from '@/theme';

type Img = { image_url: string; alt_text: string };
type Variant = { id?: string; name: string; value: string; additional_price: string; stock_quantity: string; image_url: string | null };

export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { can } = useSession();
  const allowed = id === 'new' ? can('products.create') : can('products.edit') || can('products.delete') || can('questions.answer');
  return allowed ? <ProductLoader id={id} /> : <NoAccess what="this product" />;
}

function ProductLoader({ id }: { id: string }) {
  const { can } = useSession();
  const isNew = id === 'new';
  const data = useAsync(async () => {
    const [product, categories, questions] = await Promise.all([
      isNew ? Promise.resolve(null) : getProduct(id),
      listCategories(),
      isNew ? Promise.resolve([] as ProductQuestion[]) : getProductQuestions(id),
    ]);
    return { product, categories, questions };
  }, [id]);

  if (data.error && !data.data) return <ErrorState onRetry={data.reload} message={data.error?.message} />;
  if (data.loading || !data.data) return <View style={{ padding: 16, gap: 12 }}><Skeleton style={{ height: 160 }} /><Skeleton style={{ height: 300 }} /></View>;
  if (!isNew && !data.data.product) return <EmptyState icon="package" title="Product not found" description="It may have been deleted." />;
  return <ProductForm key={data.data.product?.updated_at ?? 'new'} product={data.data.product} categories={data.data.categories} questions={data.data.questions} onSaved={data.reload}
    canEdit={isNew ? can('products.create') : can('products.edit')} canDelete={!isNew && can('products.delete')} canAnswer={can('questions.answer')} />;
}

function ProductForm({ product, categories, questions, onSaved, canEdit, canDelete, canAnswer }: {
  product: Product | null; categories: Category[]; questions: ProductQuestion[]; onSaved: () => void; canEdit: boolean; canDelete: boolean; canAnswer: boolean;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [name, setName] = useState(product?.name ?? '');
  const [slug, setSlug] = useState(product?.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(Boolean(product));
  const [brand, setBrand] = useState(product?.brand ?? '');
  const [categoryId, setCategoryId] = useState(product?.category?.id ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [details, setDetails] = useState((product?.details ?? []).join('\n'));
  const [specs, setSpecs] = useState(Object.entries(product?.specifications ?? {}).map(([k, v]) => `${k}: ${v}`).join('\n'));
  const [price, setPrice] = useState(product ? String(product.price) : '');
  const [compareAt, setCompareAt] = useState(product?.compare_at_price != null ? String(product.compare_at_price) : '');
  const [sku, setSku] = useState(product?.sku ?? '');
  const [stock, setStock] = useState(product ? String(product.stock_quantity) : '0');
  const [featured, setFeatured] = useState(product?.is_featured ?? false);
  const [active, setActive] = useState(product?.is_active ?? true);
  const [weight, setWeight] = useState(product ? String(product.weight_kg) : '0.5');
  const [dims, setDims] = useState({ l: product ? String(product.length_cm) : '20', w: product ? String(product.width_cm) : '15', h: product ? String(product.height_cm) : '10' });
  const [methods, setMethods] = useState<DeliveryMethod[]>(product?.shipping_methods ?? ['standard', 'express', 'sea']);
  const [images, setImages] = useState<Img[]>(product?.images.map((i) => ({ image_url: i.image_url, alt_text: i.alt_text })) ?? []);
  const [variants, setVariants] = useState<Variant[]>(product?.variants.map((v) => ({ id: v.id, name: v.name, value: v.value, additional_price: String(v.additional_price), stock_quantity: String(v.stock_quantity), image_url: v.image_url ?? null })) ?? []);
  const [urlInput, setUrlInput] = useState('');
  const [uploading, setUploading] = useState(0);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cbm = (Number(dims.l) * Number(dims.w) * Number(dims.h)) / 1_000_000 || 0;
  const discount = Number(compareAt) > Number(price) && Number(price) > 0 ? Math.floor(((Number(compareAt) - Number(price)) / Number(compareAt)) * 100) : 0;
  const variantStock = variants.reduce((n, v) => n + (Number(v.stock_quantity) || 0), 0);

  // ---- Images
  async function addFrom(source: 'library' | 'camera') {
    if (images.length >= 12) return toast({ title: 'Up to 12 images per product', tone: 'error' });
    if (source === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return toast({ title: 'Allow camera access in Settings to take photos', tone: 'error' });
    }
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.8, allowsMultipleSelection: source === 'library', selectionLimit: 12 - images.length };
    const res = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (res.canceled) return;
    setUploading(res.assets.length);
    for (const asset of res.assets) {
      try {
        const url = await uploadImage('product-images', asset);
        setImages((imgs) => [...imgs, { image_url: url, alt_text: name }]);
      } catch (e) {
        toast({ title: errorMessage(e), tone: 'error' });
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  function addUrl() {
    const raw = urlInput.trim();
    if (!/^https:\/\/\S+$/.test(raw)) return toast({ title: "That doesn't look like a valid https URL.", tone: 'error' });
    const host = raw.replace(/^https:\/\//, '').split('/')[0];
    if (host !== 'images.unsplash.com' && !raw.includes('/storage/v1/object/public/')) {
      return toast({ title: 'Use an Unsplash or Supabase Storage URL, or upload a photo.', tone: 'error' });
    }
    setImages((imgs) => [...imgs, { image_url: raw, alt_text: name }]);
    setUrlInput('');
  }

  function move<T>(list: T[], i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= list.length) return list;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  }

  // ---- Save / delete
  async function save() {
    setError(null);
    const specifications = Object.fromEntries(
      specs.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
        const idx = l.indexOf(':');
        return idx > 0 ? [l.slice(0, idx).trim(), l.slice(idx + 1).trim()] : [l, ''];
      }),
    );
    const payload: ProductPayload = {
      id: product?.id,
      name, slug: slug || slugify(name), brand, category_id: categoryId || null, description,
      details: details.split('\n').map((d) => d.trim()).filter(Boolean),
      specifications,
      price: Number(price || NaN), compare_at_price: compareAt.trim() ? Number(compareAt) : null,
      sku: sku || null, stock_quantity: Number(stock) || 0, is_featured: featured, is_active: active,
      weight_kg: Number(weight), length_cm: Number(dims.l), width_cm: Number(dims.w), height_cm: Number(dims.h), shipping_methods: methods,
      images,
      variants: variants.filter((v) => v.name.trim() || v.value.trim()).map((v) => ({ ...v, additional_price: Number(v.additional_price) || 0, stock_quantity: Number(v.stock_quantity) || 0, image_url: v.image_url && images.some((img) => img.image_url === v.image_url) ? v.image_url : null })),
    };
    setSaving(true);
    try {
      const savedId = await saveProduct(payload);
      toast({ title: product ? 'Product updated' : 'Product created', tone: 'success' });
      if (!product) router.replace({ pathname: '/product/[id]', params: { id: savedId } });
      else onSaved();
    } catch (e) {
      setError(errorMessage(e));
      toast({ title: errorMessage(e), tone: 'error' });
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!product) return;
    if (!(await confirm(`Delete “${product.name}”?`, "This can't be undone. Past orders keep their line items.", 'Delete'))) return;
    setDeleting(true);
    try {
      await deleteProduct(product.id);
      toast({ title: 'Product deleted', tone: 'success' });
      router.back();
    } catch (e) {
      toast({ title: errorMessage(e), tone: 'error' });
      setDeleting(false);
    }
  }

  const numberProps = { keyboardType: 'decimal-pad' as const, inputMode: 'decimal' as const };

  return (
    <>
      <Stack.Screen options={{
        title: product ? 'Edit product' : 'New product',
        headerRight: () => (
          <View style={{ flexDirection: 'row' }}>
            {product?.is_active ? <IconButton name="external-link" label="View in store" onPress={() => Linking.openURL(`${SITE.url}/products/${product.slug}`)} /> : null}
            {product && canDelete ? (deleting ? <ActivityIndicator style={{ marginHorizontal: 10 }} /> : <IconButton name="trash-2" label="Delete product" color={colors.sale} onPress={remove} />) : null}
          </View>
        ),
      }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
        <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
          {product ? <Text variant="small" tone="muted">{product.sales_count.toLocaleString()} sold · {product.review_count} reviews · {product.rating.toFixed(1)}★</Text> : null}
          {!canEdit && (
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', padding: 12, borderRadius: radius.md, backgroundColor: colors.surface2 }}>
              <Feather name="eye" size={15} color={colors.muted} />
              <Text variant="small" tone="muted" style={{ flex: 1 }}>View only. You don&apos;t have permission to edit products.</Text>
            </View>
          )}

          {/* Images */}
          <Card>
            <CardTitle title="Images" icon="image" right={<Text variant="small" tone="muted">First is the cover</Text>} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
              {images.map((img, i) => (
                <View key={`${img.image_url}-${i}`} style={{ width: 120, gap: 6 }}>
                  <View style={[styles.imageBox, { backgroundColor: colors.surface2 }, i === 0 && { borderWidth: 2, borderColor: colors.foreground }]}>
                    <Image source={img.image_url} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
                    {i === 0 && <View style={[styles.cover, { backgroundColor: colors.foreground }]}><Text style={{ color: colors.background, fontSize: 10, fontWeight: '700' }}>COVER</Text></View>}
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <SmallBtn icon="chevron-left" label="Move earlier" disabled={i === 0} onPress={() => setImages(move(images, i, -1))} />
                    <SmallBtn icon="chevron-right" label="Move later" disabled={i === images.length - 1} onPress={() => setImages(move(images, i, 1))} />
                    <SmallBtn icon="trash-2" label="Remove image" danger onPress={() => setImages(images.filter((_, j) => j !== i))} />
                  </View>
                  <TextInput value={img.alt_text} onChangeText={(t) => setImages(images.map((x, j) => (j === i ? { ...x, alt_text: t } : x)))} placeholder="Alt text"
                    placeholderTextColor={colors.subtle} style={[styles.alt, { borderColor: colors.border, color: colors.foreground }]} accessibilityLabel={`Alt text for image ${i + 1}`} />
                </View>
              ))}
              <Pressable onPress={() => addFrom('library')} disabled={uploading > 0} style={[styles.imageBox, styles.addBox, { borderColor: colors.borderStrong, width: 120 }]}>
                {uploading > 0 ? <ActivityIndicator color={colors.muted} /> : <Feather name="image" size={22} color={colors.muted} />}
                <Text variant="small" tone="muted">{uploading > 0 ? `Uploading ${uploading}…` : 'Add photos'}</Text>
              </Pressable>
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              {Platform.OS !== 'web' && <Button size="sm" variant="secondary" icon="camera" title="Camera" onPress={() => addFrom('camera')} disabled={uploading > 0} />}
              <View style={[styles.urlBox, { borderColor: colors.borderStrong, backgroundColor: colors.surface }]}>
                <Feather name="link-2" size={15} color={colors.muted} />
                <TextInput value={urlInput} onChangeText={setUrlInput} onSubmitEditing={addUrl} placeholder="…or paste image URL" placeholderTextColor={colors.subtle}
                  autoCapitalize="none" autoCorrect={false} style={{ flex: 1, color: colors.foreground, fontSize: 14, height: '100%', paddingVertical: 0 }} />
                {urlInput ? <Pressable onPress={addUrl} hitSlop={8}><Text variant="small" style={{ fontWeight: '700' }}>Add</Text></Pressable> : null}
              </View>
            </View>
          </Card>

          {/* Details */}
          <Card style={{ gap: 14 }}>
            <CardTitle title="Details" icon="file-text" />
            <Input label="Product name" value={name} onChangeText={(t) => { setName(t); if (!slugTouched) setSlug(slugify(t)); }} />
            <Input label="URL slug" value={slug} onChangeText={(t) => { setSlug(slugify(t)); setSlugTouched(true); }} autoCapitalize="none" hint={`${SITE.url.replace(/^https?:\/\//, '')}/products/${slug || '…'}`} />
            <Input label="Description" value={description} onChangeText={setDescription} multiline style={styles.area} textAlignVertical="top" />
            <Input label="Highlights" value={details} onChangeText={setDetails} multiline style={styles.area} textAlignVertical="top" hint="One per line. Shown as bullet points." />
            <Input label="Specifications" value={specs} onChangeText={setSpecs} multiline style={[styles.area, { fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }), fontSize: 13 }]} textAlignVertical="top" autoCapitalize="none" hint="One per line as “Label: value”, e.g. Weight: 254 g" />
          </Card>

          {/* Status */}
          <Card style={{ gap: 10 }}>
            <CardTitle title="Status" icon="toggle-right" />
            <SwitchRow label="Active" hint="Visible in the store" value={active} onValueChange={setActive} />
            <SwitchRow label="Featured" hint="Shown in Trending" value={featured} onValueChange={setFeatured} />
            <SelectField label="Category" value={categoryId} onChange={setCategoryId} placeholder="Uncategorised"
              options={[{ value: '', label: 'Uncategorised' }, ...categories.map((c) => ({ value: c.id, label: c.name }))]} />
            <Input label="Brand" value={brand} onChangeText={setBrand} />
          </Card>

          {/* Pricing */}
          <Card style={{ gap: 12 }}>
            <CardTitle title="Pricing (TSh)" icon="tag" />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Input label="Price" value={price} onChangeText={setPrice} {...numberProps} placeholder="0" containerStyle={{ flex: 1 }} />
              <Input label="Compare at" value={compareAt} onChangeText={setCompareAt} {...numberProps} placeholder="Optional" containerStyle={{ flex: 1 }} />
            </View>
            <Text variant="small" tone={discount > 0 ? 'sale' : 'muted'} style={discount > 0 ? { fontWeight: '700' } : undefined}>
              {discount > 0 ? `Shows as ${discount}% off` : 'Set a higher compare-at price to show a discount.'}
            </Text>
          </Card>

          {/* Inventory */}
          <Card style={{ gap: 12 }}>
            <CardTitle title="Inventory" icon="layers" />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Input label="SKU" value={sku} onChangeText={setSku} autoCapitalize="characters" placeholder="Optional" containerStyle={{ flex: 1 }} />
              <Input label="Stock" value={variants.length ? String(variantStock) : stock} editable={variants.length === 0} onChangeText={(t) => setStock(t.replace(/\D/g, ''))}
                keyboardType="number-pad" containerStyle={{ flex: 1 }} style={variants.length ? { opacity: 0.55 } : undefined} />
            </View>
            {variants.length > 0 && <Text variant="small" tone="muted">Calculated from variant stock.</Text>}
          </Card>

          {/* Variants */}
          <Card style={{ gap: 12 }}>
            <CardTitle title="Variants" icon="grid" right={<Button size="sm" variant="secondary" icon="plus" title="Add" onPress={() => setVariants([...variants, { name: variants[0]?.name ?? 'Size', value: '', additional_price: '0', stock_quantity: '0', image_url: null }])} />} />
            <Text variant="small" tone="muted">Use one option type per product (e.g. Size or Color). With variants, stock is tracked per variant. Link a photo to a variant and the store shows it when a shopper picks that option; the first image stays the cover.</Text>
            {variants.length ? variants.map((v, i) => (
              <View key={v.id ?? `new-${i}`} style={[styles.variant, { backgroundColor: colors.surface2 }]}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Input value={v.name} onChangeText={(t) => setVariants(variants.map((x, j) => (j === i ? { ...x, name: t } : x)))} placeholder="Option (Size)" containerStyle={{ flex: 1 }} style={styles.compact} />
                  <Input value={v.value} onChangeText={(t) => setVariants(variants.map((x, j) => (j === i ? { ...x, value: t } : x)))} placeholder="Value (M)" containerStyle={{ flex: 1 }} style={styles.compact} />
                </View>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
                  <Input label="Extra price" value={v.additional_price} onChangeText={(t) => setVariants(variants.map((x, j) => (j === i ? { ...x, additional_price: t } : x)))} {...numberProps} containerStyle={{ flex: 1 }} style={styles.compact} />
                  <Input label="Stock" value={v.stock_quantity} onChangeText={(t) => setVariants(variants.map((x, j) => (j === i ? { ...x, stock_quantity: t.replace(/\D/g, '') } : x)))} keyboardType="number-pad" containerStyle={{ flex: 1 }} style={styles.compact} />
                  <SmallBtn icon="arrow-up" label="Move up" disabled={i === 0} onPress={() => setVariants(move(variants, i, -1))} />
                  <SmallBtn icon="trash-2" label="Remove variant" danger onPress={() => setVariants(variants.filter((_, j) => j !== i))} />
                </View>
                {images.length > 0 && (
                  <View style={{ gap: 6 }}>
                    <Text variant="small" tone="muted">Photo for {v.value.trim() || 'this option'}</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                      <Pressable onPress={() => setVariants(variants.map((x, j) => (j === i ? { ...x, image_url: null } : x)))} accessibilityLabel="Use the cover photo"
                        style={[styles.photoPick, { borderColor: !v.image_url ? colors.foreground : colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }]}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: !v.image_url ? colors.foreground : colors.muted }}>Cover</Text>
                      </Pressable>
                      {images.map((img, n) => (
                        <Pressable key={`${img.image_url}-${n}`} onPress={() => setVariants(variants.map((x, j) => (j === i ? { ...x, image_url: img.image_url } : x)))} accessibilityLabel={`Use image ${n + 1}`}
                          style={[styles.photoPick, { borderColor: v.image_url === img.image_url ? colors.foreground : 'transparent', opacity: v.image_url === img.image_url ? 1 : 0.7 }]}>
                          <Image source={img.image_url} style={StyleSheet.absoluteFill} contentFit="cover" />
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </View>
            )) : (
              <View style={{ padding: 14, borderRadius: radius.md, backgroundColor: colors.surface2 }}>
                <Text variant="small" tone="muted" style={{ textAlign: 'center' }}>No variants. This product is sold as a single item.</Text>
              </View>
            )}
          </Card>

          {/* Shipping */}
          <Card style={{ gap: 12 }}>
            <CardTitle title="Shipping" icon="truck" right={<Pressable onPress={() => router.push('/shipping')} hitSlop={8}><Text variant="small" style={{ fontWeight: '700' }}>Edit rates</Text></Pressable>} />
            <Text variant="small" tone="muted">Packed weight and box size drive cargo prices.</Text>
            <Input label="Weight (kg)" value={weight} onChangeText={setWeight} {...numberProps} />
            <Text variant="label">Box size (cm)</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {(['l', 'w', 'h'] as const).map((k) => (
                <Input key={k} value={dims[k]} onChangeText={(t) => setDims({ ...dims, [k]: t })} {...numberProps} placeholder={{ l: 'Length', w: 'Width', h: 'Height' }[k]}
                  accessibilityLabel={{ l: 'Length (cm)', w: 'Width (cm)', h: 'Height (cm)' }[k]} containerStyle={{ flex: 1 }} />
              ))}
            </View>
            <Text variant="small" tone="muted" style={{ fontVariant: ['tabular-nums'] }}>{cbm.toFixed(4)} m³ · volumetric weight {(cbm * 167).toFixed(1)} kg (air)</Text>
            <Text variant="label" style={{ marginTop: 4 }}>Allowed methods</Text>
            {DELIVERY_METHODS.map((m) => (
              <SwitchRow key={m} label={DELIVERY_LABEL[m]} value={methods.includes(m)} onValueChange={(on) => setMethods(on ? [...methods, m] : methods.filter((x) => x !== m))} />
            ))}
            {!methods.length && <Text variant="small" tone="sale">Allow at least one method.</Text>}
          </Card>

          {questions.length > 0 && canAnswer && <Questions questions={questions} onAnswered={onSaved} />}
          {error ? <Text tone="sale">{error}</Text> : null}
        </ScrollView>
      </KeyboardAvoidingView>

      {canEdit && (
        <View style={[styles.bar, { paddingBottom: insets.bottom + 12, backgroundColor: colors.background, borderTopColor: colors.border }]}>
          <Button size="lg" title={product ? 'Save changes' : 'Create product'} icon="check" onPress={save} loading={saving} disabled={!methods.length || uploading > 0} full />
        </View>
      )}
    </>
  );
}

function Questions({ questions, onAnswered }: { questions: ProductQuestion[]; onAnswered: () => void }) {
  const toast = useToast();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  return (
    <Card style={{ gap: 12 }}>
      <CardTitle title="Customer questions" icon="message-circle" />
      {questions.map((q) => (
        <View key={q.id} style={{ gap: 6 }}>
          <Text variant="label">{q.question}</Text>
          <Text variant="small" tone="muted">{q.author_name} · {formatRelative(q.created_at)}</Text>
          {q.answer ? <Text tone="muted">↳ {q.answer}</Text> : (
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
              <Input value={drafts[q.id] ?? ''} onChangeText={(t) => setDrafts({ ...drafts, [q.id]: t })} placeholder="Write an answer…" multiline containerStyle={{ flex: 1 }} style={{ minHeight: 50, paddingTop: 13 }} />
              <Button title="Answer" loading={busy === q.id} onPress={async () => {
                setBusy(q.id);
                try { await answerQuestion(q.id, drafts[q.id] ?? ''); toast({ title: 'Answer published', tone: 'success' }); onAnswered(); }
                catch (e) { toast({ title: errorMessage(e), tone: 'error' }); }
                finally { setBusy(null); }
              }} />
            </View>
          )}
        </View>
      ))}
    </Card>
  );
}

function SmallBtn({ icon, label, onPress, disabled, danger }: { icon: keyof typeof Feather.glyphMap; label: string; onPress: () => void; disabled?: boolean; danger?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityLabel={label} hitSlop={4}
      style={({ pressed }) => ({ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? colors.surface3 : colors.surface, borderWidth: 1, borderColor: colors.border, opacity: disabled ? 0.35 : 1 })}>
      <Feather name={icon} size={15} color={danger ? colors.sale : colors.foreground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  imageBox: { width: 120, aspectRatio: 4 / 5, borderRadius: radius.md, overflow: 'hidden' },
  addBox: { borderWidth: 2, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 6 },
  cover: { position: 'absolute', left: 6, top: 6, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 },
  alt: { height: 34, borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 8, fontSize: 12 },
  urlBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, height: 38, borderWidth: 1, borderRadius: radius.full, paddingHorizontal: 12 },
  area: { height: 110, paddingTop: 12 },
  variant: { padding: 10, borderRadius: radius.md, gap: 8 },
  compact: { height: 44 },
  photoPick: { width: 46, height: 46, borderRadius: radius.sm, borderWidth: 2, overflow: 'hidden' },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
});
