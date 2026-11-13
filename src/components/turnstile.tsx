import { forwardRef, useImperativeHandle, useMemo, useState } from 'react';
import { Platform, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { useTheme } from '@/theme';

/**
 * Cloudflare Turnstile bot check for email/password and email-link sign-in, sign-up and password reset.
 * Supabase Auth requires the token (`captchaToken`) once CAPTCHA protection is switched on.
 *
 * Turnstile has no native SDK, so the widget runs in a small WebView. Its page is given the base URL
 * of the website (EXPO_PUBLIC_TURNSTILE_HOST, default https://www.herufi.shop): Cloudflare only issues
 * tokens on hostnames registered for the widget, and herufi.shop is one of them.
 * Without EXPO_PUBLIC_TURNSTILE_SITE_KEY nothing is shown and sign-in works as before.
 */
export const TURNSTILE_SITE_KEY = process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY ?? '';
const HOST = process.env.EXPO_PUBLIC_TURNSTILE_HOST ?? 'https://www.herufi.shop';

/** True when the form must wait for a token before submitting. */
export const turnstileRequired = Boolean(TURNSTILE_SITE_KEY) && Platform.OS !== 'web';

export type TurnstileHandle = { reset: () => void };

function page(siteKey: string, theme: 'light' | 'dark', language: string) {
  const opts = JSON.stringify({ sitekey: siteKey, theme, size: 'flexible', language });
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;padding:0;background:transparent;overflow:hidden}</style>
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTs&render=explicit" async defer></script>
</head><body><div id="ts"></div><script>
function send(m){window.ReactNativeWebView.postMessage(JSON.stringify(m))}
function onTs(){var o=${opts};o.callback=function(t){send({type:'token',token:t})};
o['expired-callback']=function(){send({type:'expired'})};o['error-callback']=function(){send({type:'error'})};
turnstile.render('#ts',o)}
</script></body></html>`;
}

/** Calls `onToken` with a fresh token, or null when it expires or fails. Tokens are single-use: call reset() after each attempt. */
export const Turnstile = forwardRef<TurnstileHandle, { onToken: (token: string | null) => void; language?: string }>(
  function Turnstile({ onToken, language = 'en' }, ref) {
    const { dark } = useTheme();
    const [instance, setInstance] = useState(0); // bumping it reloads the widget for a new token
    const html = useMemo(() => page(TURNSTILE_SITE_KEY, dark ? 'dark' : 'light', language), [dark, language]);

    useImperativeHandle(ref, () => ({ reset: () => { onToken(null); setInstance((n) => n + 1); } }), [onToken]);

    if (!turnstileRequired) return null;

    function onMessage(e: WebViewMessageEvent) {
      try {
        const msg = JSON.parse(e.nativeEvent.data) as { type: string; token?: string };
        onToken(msg.type === 'token' && msg.token ? msg.token : null);
      } catch {
        onToken(null);
      }
    }

    return (
      <View style={{ height: 70, overflow: 'hidden', borderRadius: 8 }}>
        <WebView
          key={instance}
          originWhitelist={['*']}
          source={{ html, baseUrl: HOST }}
          onMessage={onMessage}
          javaScriptEnabled
          scrollEnabled={false}
          style={{ backgroundColor: 'transparent' }}
          // Links inside the widget (Cloudflare privacy/terms) open outside the app.
          setSupportMultipleWindows={false}
        />
      </View>
    );
  },
);
