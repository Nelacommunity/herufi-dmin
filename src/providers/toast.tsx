import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useTheme, radius } from '@/theme';

type Toast = { id: number; title: string; description?: string; tone: 'success' | 'error' | 'info'; action?: { label: string; onPress: () => void } };
type Value = { show: (t: Omit<Toast, 'id'>) => void };
const ToastContext = createContext<Value | null>(null);

/** Lightweight toasts above the tab bar. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const show = useCallback((t: Omit<Toast, 'id'>) => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ ...t, id: Date.now() });
    timer.current = setTimeout(() => setToast(null), 3200);
  }, []);
  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast && (
        <View style={[StyleSheet.absoluteFill, { pointerEvents: 'box-none', justifyContent: 'flex-end', paddingBottom: insets.bottom + 72, paddingHorizontal: 16 }]}>
          <Animated.View key={toast.id} entering={FadeInDown.springify().damping(18)} exiting={FadeOutDown}
            style={[styles.toast, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Feather name={toast.tone === 'error' ? 'alert-circle' : toast.tone === 'success' ? 'check-circle' : 'info'} size={18}
              color={toast.tone === 'error' ? colors.sale : toast.tone === 'success' ? colors.success : colors.foreground} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.foreground, fontWeight: '600' }}>{toast.title}</Text>
              {toast.description ? <Text style={{ color: colors.muted, marginTop: 2 }} numberOfLines={2}>{toast.description}</Text> : null}
            </View>
            {toast.action && (
              <Pressable onPress={() => { toast.action?.onPress(); setToast(null); }} style={[styles.action, { backgroundColor: colors.primary }]}>
                <Text style={{ color: colors.primaryForeground, fontWeight: '600', fontSize: 13 }}>{toast.action.label}</Text>
              </Pressable>
            )}
          </Animated.View>
        </View>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx.show;
}

const styles = StyleSheet.create({
  toast: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth,
    boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
  },
  action: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.full },
});
