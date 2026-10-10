import { useEffect, useEffectEvent, useState, type ReactNode } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Switch, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { useNavigation } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import Svg, { Rect } from 'react-native-svg';
import { Chip, EmptyState, Sheet, Text } from '@/components/ui';
import { ORDER_STATUS_LABEL } from '@/lib/constants';
import { formatPrice, initials } from '@/lib/format';
import type { OrderStatus } from '@/lib/types';
import { radius, useTheme } from '@/theme';

// ---- Behaviour helpers -----------------------------------------------------------------------------------------

/** Re-run `reload` whenever the screen comes back into focus (e.g. after editing on a detail screen). */
export function useReloadOnFocus(reload: () => void) {
  const navigation = useNavigation();
  const onReturn = useEffectEvent(reload);
  useEffect(() => {
    let left = false;
    const offBlur = navigation.addListener('blur', () => { left = true; });
    const offFocus = navigation.addListener('focus', () => { if (left) { left = false; onReturn(); } });
    return () => { offBlur(); offFocus(); };
  }, [navigation]);
}

/** Yes/no confirmation that works on phones (native alert) and on web. */
export function confirm(title: string, message: string, confirmLabel = 'Confirm', destructive = true): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');

/** Shown when someone opens a screen their permissions don't cover (e.g. from a link). */
export function NoAccess({ what = 'this' }: { what?: string }) {
  return <EmptyState icon="lock" title="No access" description={`You don't have permission to see ${what}. Ask a super admin if you need it.`} />;
}

// ---- Layout -----------------------------------------------------------------------------------------------------

export function Card({ children, style, padded = true }: { children: ReactNode; style?: StyleProp<ViewStyle>; padded?: boolean }) {
  const { colors } = useTheme();
  return <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, padded && { padding: 16 }, style]}>{children}</View>;
}

export function CardTitle({ title, icon, right }: { title: string; icon?: keyof typeof Feather.glyphMap; right?: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      {icon ? <Feather name={icon} size={16} color={colors.foreground} /> : null}
      <Text variant="h3" style={{ flex: 1 }}>{title}</Text>
      {right}
    </View>
  );
}

// ---- Status & labels --------------------------------------------------------------------------------------------

export function Pill({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'success' | 'sale' | 'warning' | 'info' | 'muted' | 'dark' }) {
  const { colors } = useTheme();
  const map = {
    neutral: [colors.surface2, colors.foreground], muted: [colors.surface2, colors.muted], success: [colors.successSoft, colors.success],
    sale: [colors.saleSoft, colors.sale], warning: ['rgba(161,92,7,0.12)', colors.warning], info: [colors.accentSoft, colors.accent], dark: [colors.foreground, colors.background],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={{ color: fg, fontSize: 11, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

const STATUS_TONE: Record<OrderStatus, Parameters<typeof Pill>[0]['tone']> = {
  pending: 'warning', confirmed: 'info', processing: 'info', shipped: 'dark', delivered: 'success', cancelled: 'sale',
};
export function StatusBadge({ status }: { status: OrderStatus }) {
  return <Pill label={ORDER_STATUS_LABEL[status]} tone={STATUS_TONE[status]} />;
}

export function Avatar({ name, email, uri, size = 40 }: { name?: string | null; email?: string | null; uri?: string | null; size?: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {uri ? <Image source={uri} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Text style={{ fontWeight: '700', fontSize: size * 0.34 }}>{initials(name, email)}</Text>}
    </View>
  );
}

export function Thumb({ uri, size = 52 }: { uri?: string | null; size?: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ width: size, height: size * 1.15, borderRadius: radius.sm, backgroundColor: colors.surface2, overflow: 'hidden' }}>
      {uri ? <Image source={uri} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} /> : null}
    </View>
  );
}

// ---- Lists ------------------------------------------------------------------------------------------------------

export function Row({ left, title, subtitle, right, onPress, onLongPress, chevron = true, selected }: {
  left?: ReactNode; title: ReactNode; subtitle?: ReactNode; right?: ReactNode; onPress?: () => void; onLongPress?: () => void; chevron?: boolean; selected?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} delayLongPress={350} disabled={!onPress && !onLongPress}
      style={({ pressed }) => [styles.row, (pressed || selected) && { backgroundColor: colors.surface2 }]}>
      {left}
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        {typeof title === 'string' ? <Text variant="label" numberOfLines={1}>{title}</Text> : title}
        {typeof subtitle === 'string' ? <Text variant="small" tone="muted" numberOfLines={1}>{subtitle}</Text> : subtitle}
      </View>
      {right}
      {onPress && chevron ? <Feather name="chevron-right" size={18} color={colors.subtle} /> : null}
    </Pressable>
  );
}

export function SearchField({ value, onChangeText, onSubmit, placeholder }: { value: string; onChangeText: (s: string) => void; onSubmit: (s: string) => void; placeholder: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.search, { backgroundColor: colors.surface2 }]}>
      <Feather name="search" size={17} color={colors.muted} />
      <TextInput
        value={value} onChangeText={onChangeText} onSubmitEditing={(e) => onSubmit(e.nativeEvent.text)}
        placeholder={placeholder} placeholderTextColor={colors.subtle} returnKeyType="search" autoCapitalize="none" autoCorrect={false}
        style={{ flex: 1, color: colors.foreground, fontSize: 15, height: '100%', paddingVertical: 0 }}
      />
      {value ? (
        <Pressable onPress={() => { onChangeText(''); onSubmit(''); }} hitSlop={10} accessibilityLabel="Clear search">
          <Feather name="x-circle" size={17} color={colors.muted} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function FilterChips<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
      {options.map((o) => <Chip key={o.value} label={o.label} selected={value === o.value} onPress={() => onChange(o.value)} />)}
    </ScrollView>
  );
}

// ---- Numbers ----------------------------------------------------------------------------------------------------

export function Delta({ now, prev }: { now: number; prev: number }) {
  const { colors } = useTheme();
  if (!prev) return null;
  const pct = ((now - prev) / prev) * 100;
  const up = pct >= 0;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
      <Feather name={up ? 'arrow-up-right' : 'arrow-down-right'} size={13} color={up ? colors.success : colors.sale} />
      <Text style={{ fontSize: 12, fontWeight: '600', color: up ? colors.success : colors.sale }}>{Math.abs(pct).toFixed(0)}%</Text>
    </View>
  );
}

export function StatTile({ label, value, note, delta, style }: { label: string; value: string; note?: string; delta?: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <Card style={[{ gap: 6 }, style]}>
      <Text variant="small" tone="muted">{label}</Text>
      <Text style={{ fontSize: 22, lineHeight: 28, fontWeight: '700', letterSpacing: -0.4, fontVariant: ['tabular-nums'] }} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {delta}
        {note ? <Text style={{ fontSize: 12 }} tone="subtle" numberOfLines={1}>{note}</Text> : null}
      </View>
    </Card>
  );
}

/** Daily revenue bars. Tapping a bar isn't needed on a phone; the total is shown above the chart. */
export function BarChart({ data, height = 140, width }: { data: { day: string; revenue: number }[]; height?: number; width: number }) {
  const { colors } = useTheme();
  const max = Math.max(1, ...data.map((d) => d.revenue));
  const gap = 3;
  const bar = Math.max(2, (width - gap * (data.length - 1)) / Math.max(1, data.length));
  const first = data[0]?.day, last = data[data.length - 1]?.day;
  const label = (d?: string) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '');
  return (
    <View>
      <Svg width={width} height={height}>
        {data.map((d, i) => {
          const h = d.revenue > 0 ? Math.max(3, (d.revenue / max) * (height - 4)) : 2;
          return <Rect key={d.day} x={i * (bar + gap)} y={height - h} width={bar} height={h} rx={Math.min(3, bar / 2)} fill={d.revenue > 0 ? colors.foreground : colors.border} opacity={d.revenue > 0 ? 0.85 : 1} />;
        })}
      </Svg>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
        <Text style={{ fontSize: 11 }} tone="subtle">{label(first)}</Text>
        <Text style={{ fontSize: 11 }} tone="subtle">Peak {formatPrice(max === 1 ? 0 : max)}</Text>
        <Text style={{ fontSize: 11 }} tone="subtle">{label(last)}</Text>
      </View>
    </View>
  );
}

// ---- Forms ------------------------------------------------------------------------------------------------------

export function SwitchRow({ label, hint, value, onValueChange }: { label: string; hint?: string; value: boolean; onValueChange: (v: boolean) => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={() => onValueChange(!value)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 }} accessibilityRole="switch" accessibilityState={{ checked: value }}>
      <View style={{ flex: 1 }}>
        <Text variant="label">{label}</Text>
        {hint ? <Text variant="small" tone="muted">{hint}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onValueChange} trackColor={{ true: colors.success, false: colors.borderStrong }} thumbColor="#fff" />
    </Pressable>
  );
}

/** A tappable field that opens a bottom sheet of options. */
export function SelectField<T extends string>({ label, value, options, onChange, placeholder = 'Choose…' }: {
  label: string; value: T | ''; options: { value: T | ''; label: string }[]; onChange: (v: T | '') => void; placeholder?: string;
}) {
  const { colors } = useTheme();
  const current = options.find((o) => o.value === value);
  return (
    <SelectSheetTrigger label={label} options={options} value={value} onChange={onChange}>
      {(open) => (
        <View style={{ gap: 6 }}>
          <Text variant="label">{label}</Text>
          <Pressable onPress={open} style={[styles.select, { borderColor: colors.borderStrong, backgroundColor: colors.surface }]}>
            <Text style={{ flex: 1 }} tone={current ? 'default' : 'subtle'} numberOfLines={1}>{current?.label ?? placeholder}</Text>
            <Feather name="chevron-down" size={18} color={colors.muted} />
          </Pressable>
        </View>
      )}
    </SelectSheetTrigger>
  );
}


export function SelectSheetTrigger<T extends string>({ label, options, value, onChange, children }: {
  label: string; options: { value: T; label: string; hint?: string }[]; value: T; onChange: (v: T) => void; children: (open: () => void) => ReactNode;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <>
      {children(() => setOpen(true))}
      <Sheet visible={open} onClose={() => setOpen(false)} title={label}>
        <ScrollView contentContainerStyle={{ padding: 8 }}>
          {options.map((o) => (
            <Pressable key={o.value || '_'} onPress={() => { onChange(o.value); setOpen(false); }}
              style={[styles.option, o.value === value && { backgroundColor: colors.surface2 }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: o.value === value ? '700' : '400' }}>{o.label}</Text>
                {o.hint ? <Text variant="small" tone="muted">{o.hint}</Text> : null}
              </View>
              {o.value === value && <Feather name="check" size={18} color={colors.foreground} />}
            </Pressable>
          ))}
        </ScrollView>
      </Sheet>
    </>
  );
}

// ---- Multi-select (super admins) ------------------------------------------------------------------------------

/** Selection state for bulk actions: `active` turns on checkboxes; `toggle`/`setAll`/`clear` manage the set. */
export function useSelection() {
  const [active, setActive] = useState(false);
  const [ids, setIds] = useState<Set<string>>(new Set());
  return {
    active,
    ids,
    count: ids.size,
    has: (id: string) => ids.has(id),
    start: (id?: string) => { setActive(true); setIds(id ? new Set([id]) : new Set()); },
    toggle: (id: string) => setIds((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }),
    setAll: (all: string[]) => setIds((s) => (all.every((x) => s.has(x)) ? new Set() : new Set(all))),
    clear: () => { setActive(false); setIds(new Set()); },
  };
}

export function SelectCircle({ selected }: { selected: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: selected ? colors.foreground : colors.borderStrong, backgroundColor: selected ? colors.foreground : 'transparent', alignItems: 'center', justifyContent: 'center' }}
      accessibilityRole="checkbox" accessibilityState={{ checked: selected }}>
      {selected ? <Feather name="check" size={14} color={colors.background} /> : null}
    </View>
  );
}

/** Bottom bar shown in selection mode: select all, cancel, and a destructive delete. */
export function SelectionBar({ count, total, allSelected, onSelectAll, onCancel, onDelete, busy, bottomInset = 0 }: {
  count: number; total: number; allSelected: boolean; onSelectAll: () => void; onCancel: () => void; onDelete: () => void; busy?: boolean; bottomInset?: number;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.selBar, { backgroundColor: colors.background, borderTopColor: colors.border, paddingBottom: 12 + bottomInset }]}>
      <Pressable onPress={onCancel} hitSlop={8} style={{ paddingHorizontal: 4 }}><Text style={{ fontWeight: '600' }}>Cancel</Text></Pressable>
      <Pressable onPress={onSelectAll} hitSlop={8} disabled={!total} style={{ flex: 1, alignItems: 'center' }}>
        <Text variant="small" tone="muted">{count} selected · <Text variant="small" style={{ fontWeight: '700' }}>{allSelected ? 'Deselect all' : 'Select all'}</Text></Text>
      </Pressable>
      <Pressable onPress={onDelete} disabled={!count || busy} accessibilityLabel={`Delete ${count} selected`}
        style={({ pressed }) => [styles.selDelete, { backgroundColor: colors.sale, opacity: !count || busy ? 0.45 : pressed ? 0.85 : 1 }]}>
        <Feather name="trash-2" size={15} color="#fff" />
        <Text style={{ color: '#fff', fontWeight: '700' }}>{busy ? 'Deleting…' : `Delete${count ? ` ${count}` : ''}`}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.lg },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full, alignSelf: 'flex-start' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 44, paddingHorizontal: 14, borderRadius: radius.full },
  select: { height: 50, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderRadius: radius.md },
  selBar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  selDelete: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, height: 40, borderRadius: radius.full },
});
