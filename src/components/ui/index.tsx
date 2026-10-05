import { forwardRef, useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator, Modal, Pressable, StyleSheet, Text as RNText, TextInput, useWindowDimensions, View,
  type PressableProps, type StyleProp, type TextInputProps, type TextProps, type TextStyle, type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, FadeIn, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';
import { Feather, FontAwesome } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import { LOGO_PATH, LOGO_VIEWBOX } from '@/components/logo-path';
import { fonts, radius, space, useTheme } from '@/theme';
import { formatPrice } from '@/lib/format';

// ---- Typography -------------------------------------------------------------------
type Variant = 'display' | 'title' | 'h2' | 'h3' | 'body' | 'small' | 'caption' | 'label' | 'serif';
const variants: Record<Variant, TextStyle> = {
  display: { fontSize: 34, fontWeight: '700', letterSpacing: -1, lineHeight: 38 },
  serif: { fontSize: 30, fontFamily: fonts.serif, fontStyle: 'italic', lineHeight: 36 },
  title: { fontSize: 26, fontWeight: '700', letterSpacing: -0.6, lineHeight: 31 },
  h2: { fontSize: 21, fontWeight: '700', letterSpacing: -0.4 },
  h3: { fontSize: 17, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 22 },
  small: { fontSize: 13, lineHeight: 18 },
  caption: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
  label: { fontSize: 14, fontWeight: '600' },
};

export function Text({ variant = 'body', tone = 'default', style, ...props }: TextProps & { variant?: Variant; tone?: 'default' | 'muted' | 'subtle' | 'sale' | 'success' | 'inverse' | 'accent' }) {
  const { colors } = useTheme();
  const color = { default: colors.foreground, muted: colors.muted, subtle: colors.subtle, sale: colors.sale, success: colors.success, inverse: colors.primaryForeground, accent: colors.accent }[tone];
  return <RNText {...props} style={[variants[variant], { color }, style]} />;
}

// ---- Buttons ------------------------------------------------------------------------
type ButtonProps = Omit<PressableProps, 'style'> & {
  title?: string; icon?: keyof typeof Feather.glyphMap; variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
  size?: 'sm' | 'md' | 'lg'; loading?: boolean; full?: boolean; style?: StyleProp<ViewStyle>; children?: ReactNode;
};

export function Button({ title, icon, variant = 'primary', size = 'md', loading, disabled, full, style, children, ...props }: ButtonProps) {
  const { colors } = useTheme();
  const bg = { primary: colors.primary, secondary: colors.surface, ghost: 'transparent', danger: colors.sale, success: colors.success }[variant];
  const fg = { primary: colors.primaryForeground, secondary: colors.foreground, ghost: colors.foreground, danger: '#fff', success: '#fff' }[variant];
  const h = { sm: 38, md: 48, lg: 56 }[size];
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      {...props}
      style={({ pressed }) => [
        styles.button,
        { height: h, backgroundColor: bg, paddingHorizontal: size === 'sm' ? 14 : 22, opacity: disabled ? 0.45 : pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
        variant === 'secondary' && { borderWidth: 1, borderColor: colors.borderStrong },
        full && { alignSelf: 'stretch' },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : (
        <>
          {icon && <Feather name={icon} size={size === 'sm' ? 15 : 17} color={fg} />}
          {title ? <RNText style={{ color: fg, fontSize: size === 'lg' ? 16 : 15, fontWeight: '600' }}>{title}</RNText> : null}
          {children}
        </>
      )}
    </Pressable>
  );
}

export function IconButton({ name, onPress, label, size = 20, style, color, badge }: {
  name: keyof typeof Feather.glyphMap; onPress?: () => void; label: string; size?: number; style?: StyleProp<ViewStyle>; color?: string; badge?: number;
}) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={8}
      style={({ pressed }) => [styles.iconButton, { opacity: pressed ? 0.6 : 1 }, style]}>
      <Feather name={name} size={size} color={color ?? colors.foreground} />
      {badge ? (
        <View style={[styles.badgeDot, { backgroundColor: colors.foreground, borderColor: colors.background }]}>
          <RNText style={{ color: colors.background, fontSize: 10, fontWeight: '700' }}>{badge > 99 ? '99+' : badge}</RNText>
        </View>
      ) : null}
    </Pressable>
  );
}

// ---- Inputs ------------------------------------------------------------------------
export const Input = forwardRef<TextInput, TextInputProps & { label?: string; error?: string; hint?: string; containerStyle?: StyleProp<ViewStyle> }>(
  function Input({ label, error, hint, containerStyle, style, ...props }, ref) {
    const { colors } = useTheme();
    return (
      <View style={[{ gap: 6 }, containerStyle]}>
        {label ? <Text variant="label">{label}</Text> : null}
        <TextInput
          ref={ref}
          placeholderTextColor={colors.subtle}
          {...props}
          style={[styles.input, { borderColor: error ? colors.sale : colors.borderStrong, color: colors.foreground, backgroundColor: colors.surface }, style]}
        />
        {error ? <Text variant="small" tone="sale">{error}</Text> : hint ? <Text variant="small" tone="muted">{hint}</Text> : null}
      </View>
    );
  },
);

export function Chip({ label, selected, onPress, icon, disabled }: { label: string; selected?: boolean; onPress?: () => void; icon?: ReactNode; disabled?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityState={{ selected, disabled }}
      style={[styles.chip, { borderColor: selected ? colors.foreground : colors.borderStrong, backgroundColor: selected ? colors.foreground : colors.surface, opacity: disabled ? 0.4 : 1 }]}>
      {icon}
      <RNText style={{ color: selected ? colors.background : colors.foreground, fontSize: 14, fontWeight: '500', textDecorationLine: disabled ? 'line-through' : 'none' }}>{label}</RNText>
    </Pressable>
  );
}

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'sale' | 'glass' | 'success' }) {
  const { colors } = useTheme();
  const bg = { neutral: colors.surface2, sale: colors.sale, glass: 'rgba(255,255,255,0.9)', success: colors.successSoft }[tone];
  const fg = { neutral: colors.foreground, sale: '#fff', glass: '#111', success: colors.success }[tone];
  return <View style={[styles.badge, { backgroundColor: bg }]}><RNText style={{ color: fg, fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' }}>{label}</RNText></View>;
}

// ---- Commerce bits ------------------------------------------------------------------
export function Price({ price, compareAt, size = 'md' }: { price: number; compareAt?: number | null; size?: 'sm' | 'md' | 'lg' }) {
  const discounted = compareAt != null && compareAt > price;
  const fs = { sm: 14, md: 15, lg: 26 }[size];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
      <Text style={{ fontSize: fs, lineHeight: Math.round(fs * 1.3), fontWeight: '700', fontVariant: ['tabular-nums'] }} tone={discounted ? 'sale' : 'default'}>{formatPrice(price)}</Text>
      {discounted && <Text tone="subtle" style={{ fontSize: size === 'lg' ? 16 : 13, lineHeight: size === 'lg' ? 22 : 18, textDecorationLine: 'line-through' }}>{formatPrice(compareAt)}</Text>}
    </View>
  );
}

export function Stars({ value, size = 13 }: { value: number; size?: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 1 }} accessibilityLabel={`${value.toFixed(1)} / 5`}>
      {[1, 2, 3, 4, 5].map((i) => {
        const name = value >= i - 0.25 ? 'star' : value >= i - 0.75 ? 'star-half-full' : 'star-o';
        return <FontAwesome key={i} name={name} size={size} color={name === 'star-o' ? colors.borderStrong : colors.star} />;
      })}
    </View>
  );
}

export function QuantityStepper({ value, onChange, min = 1, max = 99, compact }: { value: number; onChange: (v: number) => void; min?: number; max?: number; compact?: boolean }) {
  const { colors } = useTheme();
  const s = compact ? 32 : 44;
  return (
    <View style={[styles.stepper, { borderColor: colors.borderStrong, backgroundColor: colors.surface }]} accessibilityRole="adjustable" accessibilityValue={{ now: value, min, max }}>
      <Pressable onPress={() => onChange(value - 1)} disabled={value <= min} style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center', opacity: value <= min ? 0.3 : 1 }} accessibilityLabel="Decrease">
        <Feather name="minus" size={compact ? 14 : 16} color={colors.foreground} />
      </Pressable>
      <Text style={{ minWidth: compact ? 22 : 30, textAlign: 'center', fontWeight: '600', fontVariant: ['tabular-nums'] }}>{value}</Text>
      <Pressable onPress={() => onChange(value + 1)} disabled={value >= max} style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center', opacity: value >= max ? 0.3 : 1 }} accessibilityLabel="Increase">
        <Feather name="plus" size={compact ? 14 : 16} color={colors.foreground} />
      </Pressable>
    </View>
  );
}

// ---- Layout & feedback ----------------------------------------------------------------
export function Logo({ size = 24, withWord = true }: { size?: number; withWord?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: size * 0.3 }} accessibilityLabel="Herufi">
      <Svg viewBox={LOGO_VIEWBOX} width={size * 0.92} height={size * 1.2}><Path d={LOGO_PATH} fill={colors.foreground} fillRule="evenodd" /></Svg>
      {withWord && <RNText style={{ fontFamily: fonts.serif, fontSize: size, color: colors.foreground, letterSpacing: -0.5 }}>herufi</RNText>}
    </View>
  );
}

export function SectionHeader({ eyebrow, title, action, onAction }: { eyebrow?: string; title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginBottom: space.lg }}>
      <View style={{ flex: 1 }}>
        {eyebrow ? <Text variant="caption" tone="muted" style={{ marginBottom: 6 }}>{eyebrow}</Text> : null}
        <Text variant="h2">{title}</Text>
      </View>
      {action ? <Pressable onPress={onAction} hitSlop={8}><Text variant="label">{action} →</Text></Pressable> : null}
    </View>
  );
}

export function Skeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return <Animated.View entering={FadeIn} style={[{ backgroundColor: colors.surface2, borderRadius: radius.md }, style]} />;
}

export function EmptyState({ icon, title, description, action }: { icon: keyof typeof Feather.glyphMap; title: string; description?: string; action?: ReactNode }) {
  const { colors } = useTheme();
  return (
    <Animated.View entering={FadeIn.duration(300)} style={{ alignItems: 'center', paddingVertical: 56, paddingHorizontal: 28, gap: 12 }}>
      <View style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}>
        <Feather name={icon} size={30} color={colors.foreground} />
      </View>
      <Text style={{ fontFamily: fonts.serif, fontSize: 28, textAlign: 'center' }}>{title}</Text>
      {description ? <Text tone="muted" style={{ textAlign: 'center' }}>{description}</Text> : null}
      {action ? <View style={{ marginTop: 12, alignSelf: 'stretch', gap: 10 }}>{action}</View> : null}
    </Animated.View>
  );
}

export function ErrorState({ onRetry, message }: { onRetry: () => void; message?: string }) {
  // Network failures surface as "Failed to fetch"/"Network request failed"; anything else is a real reason worth showing.
  const offline = !message || /fetch|network/i.test(message);
  return <EmptyState icon={offline ? 'wifi-off' : 'alert-circle'} title="Couldn't load" description={offline ? "Can't reach Herufi. Check your connection and try again." : message} action={<Button title="Retry" icon="refresh-cw" onPress={onRetry} />} />;
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return <View style={[{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }, style]} />;
}

/** Bottom sheet built on Modal. */
// The curve iOS uses for its own sheets: quick start, long soft landing, no overshoot.
const SHEET_EASE = Easing.bezier(0.32, 0.72, 0, 1);

export function Sheet({ visible, onClose, title, children, footer }: { visible: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();

  // Keep the modal mounted until the closing slide has finished.
  const [mounted, setMounted] = useState(visible);
  if (visible && !mounted) setMounted(true);

  const progress = useSharedValue(0); // 0 = off-screen, 1 = open
  const drag = useSharedValue(0);
  const sheetH = useSharedValue(screenH * 0.6);

  useEffect(() => {
    if (!mounted) return;
    if (visible) {
      drag.set(0);
      progress.set(withTiming(1, { duration: 380, easing: SHEET_EASE }));
    } else {
      progress.set(withTiming(0, { duration: 260, easing: Easing.in(Easing.cubic) }, (done) => {
        if (done) scheduleOnRN(setMounted, false);
      }));
    }
  }, [visible, mounted, progress, drag]);

  // Drag down on the handle/header to dismiss.
  const pan = Gesture.Pan()
    .activeOffsetY(6)
    .onChange((e) => { drag.set(Math.max(0, drag.get() + e.changeY)); })
    .onEnd((e) => {
      if (drag.get() > sheetH.get() * 0.3 || e.velocityY > 900) scheduleOnRN(onClose);
      else drag.set(withTiming(0, { duration: 220, easing: SHEET_EASE }));
    });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - progress.value) * (sheetH.value + 40) + drag.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value * Math.max(0, 1 - drag.value / (sheetH.value || 1)) }));

  if (!mounted) return null;
  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }, backdropStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        </Animated.View>
        <Animated.View
            onLayout={(e) => sheetH.set(e.nativeEvent.layout.height)}
            style={[styles.sheet, { backgroundColor: colors.background, paddingBottom: insets.bottom + 12 }, sheetStyle]}
          >
            <GestureDetector gesture={pan}>
              <View>
                <View style={[styles.grabber, { backgroundColor: colors.borderStrong }]} />
                <View style={styles.sheetHeader}>
                  <Text variant="h3">{title}</Text>
                  <IconButton name="x" label="Close" onPress={onClose} />
                </View>
              </View>
            </GestureDetector>
            <Divider />
            <View style={{ flexShrink: 1 }}>{children}</View>
            {footer ? <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>{footer}</View> : null}
          </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: radius.full },
  iconButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  badgeDot: { position: 'absolute', top: 2, right: 0, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  input: { height: 50, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 14, fontSize: 16 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 40, borderRadius: radius.full, borderWidth: 1 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.full, alignSelf: 'flex-start' },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: radius.full },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '90%', boxShadow: '0 -8px 30px rgba(0,0,0,0.12)' },
  grabber: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginTop: 10, marginBottom: 2 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 20, paddingRight: 8, paddingVertical: 8 },
});
