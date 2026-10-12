import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { Button, Text } from '@/components/ui';
import { formatPrice } from '@/lib/format';
import { cellKey, matrixStock, renameAt, SIZE_PRESETS, type Matrix } from '@/lib/variant-matrix';
import { radius, useTheme } from '@/theme';

/**
 * Colours (with a photo each), sizes (with an extra price each) and stock per colour/size.
 * An empty box = this colour doesn't come in this size; 0 = sold out.
 */
export function VariantMatrixEditor({ matrix: m, onChange, images }: { matrix: Matrix; onChange: (m: Matrix) => void; images: { image_url: string }[] }) {
  const { colors } = useTheme();
  const [picking, setPicking] = useState<number | null>(null);
  const [fill, setFill] = useState('');
  const colours = m.colours.length ? m.colours : [null];
  const sizes = m.sizes.length ? m.sizes : [null];
  const field = [styles.field, { borderColor: colors.borderStrong, color: colors.foreground, backgroundColor: colors.surface }];
  const dropCells = (pred: (c: string, s: string) => boolean) =>
    Object.fromEntries(Object.entries(m.stock).filter(([k]) => { const [c, s] = k.split('|'); return !pred(c, s); }));

  return (
    <View style={{ gap: 18 }}>
      {/* Colours */}
      <View style={{ gap: 8 }}>
        <View style={styles.head}>
          <Text variant="label" style={{ flex: 1 }}>Colours <Text variant="small" tone="muted">· each with its photo</Text></Text>
          <Button size="sm" variant="ghost" icon="plus" title="Colour" onPress={() => onChange({ ...m, colours: [...m.colours, { name: '', image_url: null }] })} />
        </View>
        {m.colours.map((c, i) => (
          <View key={i} style={{ gap: 6 }}>
            <View style={styles.row}>
              <Pressable onPress={() => setPicking(picking === i ? null : i)} accessibilityLabel={`Photo for ${c.name || 'this colour'}`}
                style={[styles.thumb, { borderColor: picking === i ? colors.foreground : colors.borderStrong, backgroundColor: colors.surface2 }]}>
                {c.image_url ? <Image source={c.image_url} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Feather name="image" size={16} color={colors.muted} />}
              </Pressable>
              <TextInput value={c.name} placeholder="e.g. Black" placeholderTextColor={colors.subtle} accessibilityLabel={`Colour ${i + 1}`}
                onChangeText={(t) => onChange(renameAt(m, 'colour', i, t))} style={[field, { flex: 1 }]} />
              <Pressable onPress={() => { setPicking(null); onChange({ ...m, colours: m.colours.filter((_, j) => j !== i), stock: dropCells((cc) => cc === c.name) }); }}
                accessibilityLabel={`Remove ${c.name || 'colour'}`} hitSlop={6} style={styles.icon}><Feather name="trash-2" size={16} color={colors.sale} /></Pressable>
            </View>
            {picking === i && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingLeft: 52 }}>
                {images.length ? images.map((img, n) => (
                  <Pressable key={`${img.image_url}-${n}`} accessibilityLabel={`Use image ${n + 1}`}
                    onPress={() => { onChange({ ...m, colours: m.colours.map((x, j) => (j === i ? { ...x, image_url: img.image_url } : x)) }); setPicking(null); }}
                    style={[styles.pick, { borderColor: c.image_url === img.image_url ? colors.foreground : 'transparent' }]}>
                    <Image source={img.image_url} style={StyleSheet.absoluteFill} contentFit="cover" />
                  </Pressable>
                )) : <Text variant="small" tone="muted">Add product photos above first, then pick one for this colour.</Text>}
                {c.image_url ? (
                  <Pressable onPress={() => { onChange({ ...m, colours: m.colours.map((x, j) => (j === i ? { ...x, image_url: null } : x)) }); setPicking(null); }}
                    style={[styles.pick, { borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }]}><Text style={{ fontSize: 10 }} tone="muted">None</Text></Pressable>
                ) : null}
              </ScrollView>
            )}
          </View>
        ))}
        {!m.colours.length && <Text variant="small" tone="muted">No colours. Add some if this product comes in different colours.</Text>}
      </View>

      {/* Sizes */}
      <View style={{ gap: 8 }}>
        <View style={styles.head}>
          <Text variant="label" style={{ flex: 1 }}>Sizes <Text variant="small" tone="muted">· extra price per size</Text></Text>
          <Button size="sm" variant="ghost" icon="plus" title="Size" onPress={() => onChange({ ...m, sizes: [...m.sizes, { name: '', extra: '' }] })} />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {SIZE_PRESETS.map((p) => (
            <Pressable key={p.label} onPress={() => onChange({ ...m, sizes: [...m.sizes, ...p.sizes.filter((s) => !m.sizes.some((x) => x.name === s)).map((s) => ({ name: s, extra: '' }))] })}
              style={[styles.preset, { borderColor: colors.borderStrong }]}><Text variant="small">+ {p.label}</Text></Pressable>
          ))}
        </ScrollView>
        {m.sizes.map((s, i) => (
          <View key={i} style={styles.row}>
            <TextInput value={s.name} placeholder="e.g. M" placeholderTextColor={colors.subtle} accessibilityLabel={`Size ${i + 1}`}
              onChangeText={(t) => onChange(renameAt(m, 'size', i, t))} style={[field, { width: 90 }]} />
            <View style={[field, { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
              <Text variant="small" tone="muted" numberOfLines={1} style={{ flexShrink: 0 }}>+ TSh</Text>
              <TextInput value={s.extra} placeholder="0" placeholderTextColor={colors.subtle} keyboardType="number-pad" accessibilityLabel={`Extra price for ${s.name || 'this size'}`}
                onChangeText={(t) => onChange({ ...m, sizes: m.sizes.map((x, j) => (j === i ? { ...x, extra: digits(t) } : x)) })}
                style={{ flex: 1, color: colors.foreground, fontSize: 15, paddingVertical: 0 }} />
            </View>
            <Pressable onPress={() => onChange({ ...m, sizes: m.sizes.filter((_, j) => j !== i), stock: dropCells((_, ss) => ss === s.name) })}
              accessibilityLabel={`Remove ${s.name || 'size'}`} hitSlop={6} style={styles.icon}><Feather name="trash-2" size={16} color={colors.sale} /></Pressable>
          </View>
        ))}
        {!m.sizes.length && <Text variant="small" tone="muted">No sizes. Add some if this product comes in different sizes.</Text>}
      </View>

      {/* Stock */}
      {(m.colours.length > 0 || m.sizes.length > 0) && (
        <View style={{ gap: 10 }}>
          <View style={styles.head}>
            <Text variant="label" style={{ flex: 1 }}>Stock</Text>
            <TextInput value={fill} onChangeText={(t) => setFill(digits(t))} placeholder="Qty" placeholderTextColor={colors.subtle} keyboardType="number-pad"
              accessibilityLabel="Stock for every combination" style={[field, { width: 64, height: 36 }]} />
            <Button size="sm" variant="secondary" title="Set all" disabled={!fill}
              onPress={() => onChange({ ...m, stock: Object.fromEntries(colours.flatMap((c) => sizes.map((s) => [cellKey(c?.name ?? '', s?.name ?? ''), fill]))) })} />
          </View>
          <Text variant="small" tone="muted">Leave a box empty if that combination doesn&apos;t exist. 0 = sold out.</Text>
          {colours.map((c, i) => (
            <View key={i} style={[styles.block, { backgroundColor: colors.surface2 }]}>
              {c ? (
                <View style={[styles.row, { marginBottom: 8 }]}>
                  <View style={[styles.dot, { backgroundColor: colors.surface }]}>{c.image_url ? <Image source={c.image_url} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}</View>
                  <Text variant="label">{c.name || '?'}</Text>
                </View>
              ) : null}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {sizes.map((s, j) => {
                  const key = cellKey(c?.name ?? '', s?.name ?? '');
                  const v = m.stock[key] ?? '';
                  return (
                    <View key={j} style={{ alignItems: 'center', gap: 3 }}>
                      <Text style={{ fontSize: 11 }} tone="muted">{s ? `${s.name || '?'}${Number(s.extra) > 0 ? ` +${formatPrice(Number(s.extra))}` : ''}` : 'Stock'}</Text>
                      <TextInput value={v} placeholder="—" placeholderTextColor={colors.subtle} keyboardType="number-pad"
                        accessibilityLabel={`Stock for ${[c?.name, s?.name].filter(Boolean).join(' ')}`}
                        onChangeText={(t) => onChange({ ...m, stock: { ...m.stock, [key]: digits(t) } })}
                        style={[styles.cell, { color: v === '0' ? colors.sale : colors.foreground, borderColor: v === '' ? colors.borderStrong : v === '0' ? colors.sale : colors.borderStrong,
                          borderStyle: v === '' ? 'dashed' : 'solid', backgroundColor: v === '' ? 'transparent' : v === '0' ? colors.saleSoft : colors.surface }]} />
                    </View>
                  );
                })}
              </View>
            </View>
          ))}
          <Text variant="small" tone="muted">{matrixStock(m).toLocaleString()} in stock in total.</Text>
        </View>
      )}
    </View>
  );
}

/** Digits only, without leading zeros ('02000' → '2000', '0' stays '0'). */
const digits = (t: string) => t.replace(/\D/g, '').replace(/^0+(?=\d)/, '');

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  field: { height: 44, borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 12, fontSize: 15 },
  thumb: { width: 44, height: 44, borderRadius: radius.sm, borderWidth: 1.5, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  pick: { width: 52, height: 52, borderRadius: radius.sm, borderWidth: 2, overflow: 'hidden' },
  icon: { width: 34, height: 44, alignItems: 'center', justifyContent: 'center' },
  preset: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.full, borderWidth: 1 },
  block: { padding: 12, borderRadius: radius.md },
  dot: { width: 26, height: 26, borderRadius: 13, overflow: 'hidden' },
  cell: { width: 62, height: 40, borderWidth: 1, borderRadius: radius.sm, textAlign: 'center', fontSize: 15 },
});
