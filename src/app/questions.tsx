import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Divider, EmptyState, ErrorState, Input, Skeleton, Text } from '@/components/ui';
import { errorMessage, FilterChips, NoAccess } from '@/components/admin';
import { answerQuestion, listQuestions } from '@/lib/admin';
import { formatRelative } from '@/lib/format';
import { useAsync } from '@/lib/use-async';
import { useToast } from '@/providers/toast';
import { useSession } from '@/providers/session';
import { useTheme } from '@/theme';

export default function Questions() {
  const { can } = useSession();
  return can('questions.answer') ? <QuestionsScreen /> : <NoAccess what="customer questions" />;
}

function QuestionsScreen() {
  const { colors } = useTheme();
  const toast = useToast();
  const [show, setShow] = useState<'open' | 'all'>('open');
  const data = useAsync(() => listQuestions(show === 'open'), [show]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  async function answer(id: string) {
    setBusy(id);
    try {
      await answerQuestion(id, drafts[id] ?? '');
      toast({ title: 'Answer published', tone: 'success' });
      data.reload();
    } catch (e) {
      toast({ title: errorMessage(e), tone: 'error' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingVertical: 10 }}>
        <FilterChips options={[{ value: 'open', label: 'Unanswered' }, { value: 'all', label: 'All' }]} value={show} onChange={setShow} />
      </View>
      <Divider />
      {data.error && !data.data ? <ErrorState onRetry={data.reload} message={data.error?.message} /> : (
        <FlatList
          data={data.loading ? [] : data.data ?? []}
          keyExtractor={(q) => q.id}
          keyboardShouldPersistTaps="handled"
          ItemSeparatorComponent={() => <Divider />}
          refreshControl={<RefreshControl refreshing={data.refreshing} onRefresh={data.reload} />}
          renderItem={({ item: q }) => (
            <View style={{ padding: 16, gap: 6 }}>
              {q.product ? (
                <Pressable onPress={() => router.push({ pathname: '/product/[id]', params: { id: q.product!.id } })} hitSlop={6}>
                  <Text variant="caption" tone="muted" numberOfLines={1}>{q.product.name} ›</Text>
                </Pressable>
              ) : null}
              <Text variant="label">{q.question}</Text>
              <Text variant="small" tone="muted">{q.author_name} · {formatRelative(q.created_at)}</Text>
              {q.answer ? <Text tone="muted">↳ {q.answer}</Text> : (
                <View style={{ gap: 8, marginTop: 4 }}>
                  <Input value={drafts[q.id] ?? ''} onChangeText={(t) => setDrafts({ ...drafts, [q.id]: t })} placeholder="Write an answer…" multiline style={{ minHeight: 70, paddingTop: 12 }} textAlignVertical="top" />
                  <Button size="sm" title="Publish answer" icon="send" onPress={() => answer(q.id)} loading={busy === q.id} style={{ alignSelf: 'flex-end' }} />
                </View>
              )}
            </View>
          )}
          ListEmptyComponent={data.loading ? <View style={{ padding: 16, gap: 12 }}>{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} style={{ height: 80 }} />)}</View>
            : <EmptyState icon="message-circle" title={show === 'open' ? 'All answered' : 'No questions yet'} description={show === 'open' ? 'New customer questions will show up here.' : undefined} />}
        />
      )}
    </View>
  );
}
