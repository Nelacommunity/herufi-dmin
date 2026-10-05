import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Switch, View } from 'react-native';
import { Stack } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Button, Divider, ErrorState, IconButton, Input, Sheet, Skeleton, Text } from '@/components/ui';
import { Avatar, Card, confirm, errorMessage, NoAccess, Pill } from '@/components/admin';
import { listStaff, setStaff, type StaffMember } from '@/lib/admin';
import { formatDate } from '@/lib/format';
import { PERMISSIONS, ROLE_LABEL, type Permission } from '@/lib/permissions';
import { useAsync } from '@/lib/use-async';
import { useSession } from '@/providers/session';
import { useToast } from '@/providers/toast';
import { radius, useTheme } from '@/theme';

const GROUPS = [...new Set(PERMISSIONS.map((p) => p.group))];

export default function Staff() {
  const { isSuper } = useSession();
  return isSuper ? <StaffScreen /> : <NoAccess what="staff management" />;
}

function StaffScreen() {
  const { colors } = useTheme();
  const { user } = useSession();
  const toast = useToast();
  const data = useAsync(listStaff, []);
  const [editing, setEditing] = useState<StaffMember | 'new' | null>(null);

  async function remove(s: StaffMember) {
    const ok = await confirm(`Remove ${s.email} from staff?`, 'Their account stays, but they become a regular customer. Discount codes assigned to them keep their order history.', 'Remove');
    if (!ok) return;
    try { await setStaff(s.email ?? '', 'customer', []); toast({ title: 'Staff access removed', tone: 'success' }); data.reload(); }
    catch (e) { toast({ title: errorMessage(e), tone: 'error' }); }
  }

  const staff = data.data ?? [];
  return (
    <>
      <Stack.Screen options={{ headerRight: () => <IconButton name="user-plus" label="Add staff" onPress={() => setEditing('new')} /> }} />
      {data.error && !data.data ? <ErrorState onRetry={data.reload} message={data.error?.message} /> : (
        <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={data.refreshing} onRefresh={data.reload} />}>
          <Text variant="small" tone="muted">Super admins can do everything, including managing staff. Admins can only do what you allow.</Text>
          {data.loading ? <Skeleton style={{ height: 240 }} /> : (
            <Card padded={false}>
              {staff.map((s, i) => {
                const me = s.user_id === user?.id;
                return (
                  <View key={s.user_id}>
                    {i > 0 && <Divider />}
                    <Pressable disabled={me} onPress={() => setEditing(s)} style={({ pressed }) => ({ padding: 14, gap: 8, backgroundColor: pressed ? colors.surface2 : 'transparent' })}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        <Avatar name={s.full_name} email={s.email} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text variant="label" numberOfLines={1}>{s.full_name ?? s.email}{me ? '  (you)' : ''}</Text>
                          <Text variant="small" tone="muted" numberOfLines={1}>{s.email} · since {formatDate(s.created_at)}</Text>
                        </View>
                        <Pill label={ROLE_LABEL[s.role]} tone={s.role === 'super_admin' ? 'dark' : 'neutral'} />
                        {!me && <IconButton name="user-minus" label={`Remove ${s.email}`} size={17} color={colors.sale} onPress={() => remove(s)} style={{ width: 34, height: 34 }} />}
                      </View>
                      {s.status === 'suspended' && <Pill label="Suspended" tone="sale" />}
                      {s.role === 'admin' && (
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                          {s.permissions.length ? s.permissions.map((p) => <Pill key={p} label={PERMISSIONS.find((x) => x.key === p)?.label ?? p} tone="muted" />)
                            : <Text variant="small" tone="sale">No permissions yet: they only see their own discount codes.</Text>}
                        </View>
                      )}
                    </Pressable>
                  </View>
                );
              })}
            </Card>
          )}
        </ScrollView>
      )}
      <Sheet visible={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add staff' : 'Edit access'}>
        {editing !== null ? <StaffForm key={editing === 'new' ? 'new' : editing.user_id} member={editing === 'new' ? null : editing} onDone={() => { setEditing(null); data.reload(); }} /> : null}
      </Sheet>
    </>
  );
}

function StaffForm({ member, onDone }: { member: StaffMember | null; onDone: () => void }) {
  const { colors } = useTheme();
  const toast = useToast();
  const [email, setEmail] = useState(member?.email ?? '');
  const [role, setRole] = useState<'admin' | 'super_admin'>(member?.role === 'super_admin' ? 'super_admin' : 'admin');
  const [perms, setPerms] = useState<Permission[]>((member?.permissions ?? []) as Permission[]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toggle = (p: Permission, on: boolean) => setPerms(on ? [...perms, p] : perms.filter((x) => x !== p));

  async function save() {
    setError(null);
    if (role === 'super_admin' && member?.role !== 'super_admin') {
      const ok = await confirm('Make this person a super admin?', 'They will have full control, including adding and removing other super admins.', 'Make super admin', false);
      if (!ok) return;
    }
    setBusy(true);
    try {
      await setStaff(email, role, perms);
      toast({ title: member ? 'Access updated' : 'Added to staff', tone: 'success' });
      onDone();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
      <Input label="Email" value={email} onChangeText={setEmail} editable={!member} autoCapitalize="none" keyboardType="email-address" autoComplete="email"
        hint={member ? undefined : 'They need a Herufi account first. Ask them to sign up on the store, then add them here.'} style={member ? { opacity: 0.6 } : undefined} />
      <View style={{ gap: 8 }}>
        <Text variant="label">Role</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(['admin', 'super_admin'] as const).map((r) => (
            <Pressable key={r} onPress={() => setRole(r)} style={{ flex: 1, padding: 12, borderRadius: radius.md, borderWidth: 1.5, borderColor: role === r ? colors.foreground : colors.border, backgroundColor: role === r ? colors.surface2 : colors.surface, gap: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {r === 'super_admin' && <Feather name="shield" size={14} color={colors.foreground} />}
                <Text variant="label">{ROLE_LABEL[r]}</Text>
              </View>
              <Text variant="small" tone="muted">{r === 'admin' ? 'Only what you allow' : 'Everything, incl. staff'}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      {role === 'admin' ? (
        <View style={{ gap: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text variant="label" style={{ flex: 1 }}>Permissions</Text>
            <Pressable onPress={() => setPerms(perms.length === PERMISSIONS.length ? [] : PERMISSIONS.map((p) => p.key))} hitSlop={8}>
              <Text variant="small" style={{ fontWeight: '700' }}>{perms.length === PERMISSIONS.length ? 'Clear all' : 'Select all'}</Text>
            </Pressable>
          </View>
          {GROUPS.map((g) => (
            <View key={g} style={{ gap: 4 }}>
              <Text variant="caption" tone="muted">{g}</Text>
              {PERMISSIONS.filter((p) => p.group === g).map((p) => (
                <Pressable key={p.key} onPress={() => toggle(p.key, !perms.includes(p.key))} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 }}>
                  <View style={{ flex: 1 }}>
                    <Text>{p.label}</Text>
                    <Text variant="small" tone="muted">{p.hint}</Text>
                  </View>
                  <Switch value={perms.includes(p.key)} onValueChange={(on) => toggle(p.key, on)} trackColor={{ true: colors.success, false: colors.borderStrong }} thumbColor="#fff" />
                </Pressable>
              ))}
            </View>
          ))}
          <Text variant="small" tone="muted" style={{ padding: 12, borderRadius: radius.md, backgroundColor: colors.surface2 }}>
            Every admin can always see the discount codes assigned to them and the orders made with those codes.
          </Text>
        </View>
      ) : (
        <Text variant="small" style={{ padding: 12, borderRadius: radius.md, backgroundColor: colors.saleSoft, color: colors.sale }}>
          Super admins have full control, including adding and removing other super admins. Only give this to people you fully trust.
        </Text>
      )}
      {error ? <Text tone="sale">{error}</Text> : null}
      <Button size="lg" title={member ? 'Save access' : 'Add to staff'} onPress={save} loading={busy} />
    </ScrollView>
  );
}
