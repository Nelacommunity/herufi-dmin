import { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Stack } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Button, Divider, EmptyState, ErrorState, IconButton, Input, Sheet, Skeleton, Text } from '@/components/ui';
import { Card, confirm, errorMessage, NoAccess } from '@/components/admin';
import { deleteCategory, listCategories, reorderCategories, saveCategory, slugify, uploadImage } from '@/lib/admin';
import type { Category } from '@/lib/types';
import { useAsync } from '@/lib/use-async';
import { useToast } from '@/providers/toast';
import { useSession } from '@/providers/session';
import { radius, useTheme } from '@/theme';

export default function Categories() {
  const { can } = useSession();
  return can('categories.manage') ? <CategoriesScreen /> : <NoAccess what="categories" />;
}

function CategoriesScreen() {
  const { colors } = useTheme();
  const toast = useToast();
  const data = useAsync(listCategories, []);
  // Local order for instant feedback while the reorder saves.
  const [order, setOrder] = useState<{ source?: Category[]; list: Category[] }>({ list: [] });
  if (data.data && order.source !== data.data) setOrder({ source: data.data, list: data.data });
  const list = order.list;
  const [editing, setEditing] = useState<Category | 'new' | null>(null);
  const [busy, setBusy] = useState(false);

  async function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    setOrder({ source: order.source, list: next });
    setBusy(true);
    try { await reorderCategories(next.map((c) => c.id)); }
    catch (e) { toast({ title: errorMessage(e), tone: 'error' }); setOrder({ source: order.source, list }); }
    finally { setBusy(false); }
  }

  async function remove(c: Category) {
    if (!(await confirm(`Delete “${c.name}”?`, `Its ${c.product_count ?? 0} products will become uncategorised.`, 'Delete'))) return;
    try { await deleteCategory(c.id); toast({ title: 'Category deleted', tone: 'success' }); data.reload(); }
    catch (e) { toast({ title: errorMessage(e), tone: 'error' }); }
  }

  return (
    <>
      <Stack.Screen options={{ headerRight: () => <IconButton name="plus" label="Add category" onPress={() => setEditing('new')} /> }} />
      {data.error && !data.data ? <ErrorState onRetry={data.reload} message={data.error?.message} /> : (
        <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={data.refreshing} onRefresh={data.reload} />}>
          <Text variant="small" tone="muted">The order here sets the order in the store&apos;s navigation and on the homepage.</Text>
          {data.loading ? <Skeleton style={{ height: 300 }} /> : (
            <Card padded={false}>
              {list.map((c, i) => (
                <View key={c.id}>
                  {i > 0 && <Divider />}
                  <View style={styles.row}>
                    <View style={{ gap: 2 }}>
                      <IconButton name="chevron-up" label={`Move ${c.name} up`} size={18} onPress={() => move(i, -1)} style={{ width: 30, height: 26, opacity: i === 0 || busy ? 0.3 : 1 }} />
                      <IconButton name="chevron-down" label={`Move ${c.name} down`} size={18} onPress={() => move(i, 1)} style={{ width: 30, height: 26, opacity: i === list.length - 1 || busy ? 0.3 : 1 }} />
                    </View>
                    <View style={[styles.thumb, { backgroundColor: colors.surface2 }]}>{c.image_url ? <Image source={c.image_url} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}</View>
                    <Pressable onPress={() => setEditing(c)} style={{ flex: 1, minWidth: 0 }}>
                      <Text variant="label" numberOfLines={1}>{c.name}</Text>
                      <Text variant="small" tone="muted" numberOfLines={1}>/{c.slug} · {c.product_count ?? 0} products</Text>
                    </Pressable>
                    <IconButton name="edit-2" label={`Edit ${c.name}`} size={17} onPress={() => setEditing(c)} />
                    <IconButton name="trash-2" label={`Delete ${c.name}`} size={17} color={colors.sale} onPress={() => remove(c)} />
                  </View>
                </View>
              ))}
              {!list.length && <EmptyState icon="folder" title="No categories" action={<Button title="Add category" icon="plus" onPress={() => setEditing('new')} />} />}
            </Card>
          )}
        </ScrollView>
      )}
      <Sheet visible={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'New category' : 'Edit category'}>
        {editing !== null ? <CategoryForm key={editing === 'new' ? 'new' : editing.id} category={editing === 'new' ? null : editing} onDone={() => { setEditing(null); data.reload(); }} /> : null}
      </Sheet>
    </>
  );
}

function CategoryForm({ category, onDone }: { category: Category | null; onDone: () => void }) {
  const { colors } = useTheme();
  const toast = useToast();
  const [name, setName] = useState(category?.name ?? '');
  const [slug, setSlug] = useState(category?.slug ?? '');
  const [description, setDescription] = useState(category?.description ?? '');
  const [image, setImage] = useState(category?.image_url ?? '');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85, allowsEditing: true, aspect: [16, 9] });
    if (res.canceled) return;
    setUploading(true);
    try { setImage(await uploadImage('category-images', res.assets[0])); }
    catch (e) { toast({ title: errorMessage(e), tone: 'error' }); }
    finally { setUploading(false); }
  }

  async function save() {
    setError(null);
    setSaving(true);
    try {
      await saveCategory({ id: category?.id, name, slug, description, image_url: image });
      toast({ title: category ? 'Category updated' : 'Category created', tone: 'success' });
      onDone();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }} keyboardShouldPersistTaps="handled">
      <Pressable onPress={pick} style={[styles.cover, { borderColor: colors.borderStrong }]}>
        {image ? <Image source={image} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
        {uploading ? <ActivityIndicator color={colors.muted} /> : !image ? (
          <View style={{ alignItems: 'center', gap: 6 }}><Feather name="image" size={22} color={colors.muted} /><Text variant="small" tone="muted">Upload cover image</Text></View>
        ) : (
          <View style={[styles.change, { backgroundColor: 'rgba(0,0,0,0.55)' }]}><Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Change</Text></View>
        )}
      </Pressable>
      <Input label="Name" value={name} onChangeText={(t) => { setName(t); if (!category) setSlug(slugify(t)); }} />
      <Input label="Slug" value={slug} onChangeText={(t) => setSlug(slugify(t))} autoCapitalize="none" hint={`/categories/${slug || '…'}`} />
      <Input label="Description" value={description} onChangeText={setDescription} multiline style={{ height: 90, paddingTop: 12 }} textAlignVertical="top" placeholder="Optional" />
      {error ? <Text tone="sale">{error}</Text> : null}
      <Button size="lg" title="Save category" onPress={save} loading={saving} disabled={uploading} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8, paddingVertical: 10 },
  thumb: { width: 52, height: 52, borderRadius: radius.md, overflow: 'hidden' },
  cover: { aspectRatio: 16 / 9, borderRadius: radius.md, borderWidth: 2, borderStyle: 'dashed', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  change: { position: 'absolute', right: 8, bottom: 8, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
});
