import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Button, Input, Logo, Text } from '@/components/ui';
import { Card } from '@/components/admin';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session';
import { useTheme } from '@/theme';

function friendly(message: string) {
  if (/invalid login credentials/i.test(message)) return 'Wrong email or password.';
  if (/email not confirmed/i.test(message)) return 'Confirm your email address first, then sign in.';
  if (/rate limit|too many/i.test(message)) return 'Too many attempts. Wait a minute and try again.';
  return message;
}

export default function SignIn() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { status, profile, user, signOut, recheck } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Enter a valid email address.');
    if (!password) return setError('Enter your password.');
    setBusy(true);
    const { error: e } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (e) setError(friendly(e.message));
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24, gap: 28 }} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: 'center', gap: 10 }}>
          <Logo size={34} />
          <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: colors.foreground }}>
            <Text style={{ color: colors.background, fontSize: 11, fontWeight: '700', letterSpacing: 1.2 }}>ADMIN</Text>
          </View>
        </View>

        {status === 'not-admin' ? (
          <Card style={{ gap: 12, alignItems: 'center', paddingVertical: 28 }}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.saleSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Feather name="lock" size={24} color={colors.sale} />
            </View>
            <Text variant="h2" style={{ textAlign: 'center' }}>{profile?.status === 'suspended' ? 'Account suspended' : 'Not an admin account'}</Text>
            <Text tone="muted" style={{ textAlign: 'center' }}>
              {user?.email} doesn&apos;t have access to the Herufi admin. Ask an existing admin to set your role to admin, then try again.
            </Text>
            <View style={{ alignSelf: 'stretch', gap: 10, marginTop: 8 }}>
              <Button title="Check again" icon="refresh-cw" onPress={recheck} />
              <Button variant="secondary" title="Sign out" onPress={signOut} />
            </View>
          </Card>
        ) : (
          <View style={{ gap: 16 }}>
            <View style={{ gap: 6 }}>
              <Text variant="title">Sign in</Text>
              <Text tone="muted">Use your Herufi admin account. Orders, products, customers, discounts and shipping, all from your phone.</Text>
            </View>
            <Input label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="username" placeholder="you@herufi.co.tz" />
            <Input label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" textContentType="password" onSubmitEditing={submit} returnKeyType="go" />
            {error ? <Text tone="sale">{error}</Text> : null}
            <Button size="lg" title="Sign in" onPress={submit} loading={busy} />
            <Text variant="small" tone="subtle" style={{ textAlign: 'center' }}>Forgot your password? Reset it on the Herufi website.</Text>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
