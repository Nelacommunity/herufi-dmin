/** "TSh 725,000": Tanzanian shillings, no decimals. Implemented by hand so it renders identically on every engine. */
export function formatPrice(value: number | string | null | undefined) {
  const n = Math.round(Number(value ?? 0));
  const s = Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${n < 0 ? '−' : ''}TSh ${s}`;
}

const MONTHS = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  sw: ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ago', 'Sep', 'Okt', 'Nov', 'Des'],
};
const MONTHS_LONG = {
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  sw: ['Januari', 'Februari', 'Machi', 'Aprili', 'Mei', 'Juni', 'Julai', 'Agosti', 'Septemba', 'Oktoba', 'Novemba', 'Desemba'],
};

type L = 'en' | 'sw';

export function formatDate(value: string | Date, locale: L = 'en', style: 'short' | 'long' = 'short') {
  const d = new Date(value);
  const months = style === 'long' ? MONTHS_LONG[locale] : MONTHS[locale];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatDayMonth(d: Date, locale: L = 'en') {
  return `${d.getDate()} ${MONTHS[locale][d.getMonth()]}`;
}

export function formatRelative(value: string | Date, locale: L = 'en') {
  const s = (Date.now() - new Date(value).getTime()) / 1000;
  const units: [number, string, string, string][] = [
    [31536000, 'year', 'mwaka', 'miaka'], [2592000, 'month', 'mwezi', 'miezi'], [604800, 'week', 'wiki', 'wiki'],
    [86400, 'day', 'siku', 'siku'], [3600, 'hour', 'saa', 'saa'], [60, 'minute', 'dakika', 'dakika'],
  ];
  for (const [secs, en, sw1, swN] of units) {
    if (s >= secs) {
      const n = Math.floor(s / secs);
      return locale === 'sw' ? `${n === 1 ? sw1 : swN} ${n} ${n === 1 ? 'iliyopita' : 'zilizopita'}` : `${n} ${en}${n === 1 ? '' : 's'} ago`;
    }
  }
  return locale === 'sw' ? 'sasa hivi' : 'just now';
}

export function initials(name: string | null | undefined, email?: string | null) {
  const src = (name || email || '?').trim();
  const parts = src.split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : src.slice(0, 2)).toUpperCase();
}

/** Resize an Unsplash image for the device and force JPEG, so phones never receive a format they can't decode. */
export function sizedImage(url: string | null | undefined, w: number): string | undefined {
  if (!url) return undefined;
  if (!url.includes('images.unsplash.com')) return url;
  const base = url.replace(/([?&])(w|fm|auto|q)=[^&]*/g, '$1').replace(/[?&]+$/, '').replace(/&{2,}/g, '&').replace('?&', '?');
  return `${base}${base.includes('?') ? '&' : '?'}w=${w}&fm=jpg&q=75`;
}
