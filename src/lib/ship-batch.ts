/**
 * Consolidated shipping batches (mirrors src/lib/shipping.ts in the web repo and next_ship_date() in SQL).
 * Goods leave the China warehouse on the 14th and 28th; an order joins a batch if placed at least 12 days before it.
 */
export const SHIP_DAYS = [14, 28];
export const SHIP_CUTOFF_DAYS = 12;
const SHIP_TZ = 'Africa/Dar_es_Salaam';

/** Today's date in Tanzania as a UTC-midnight Date. */
function tzToday(at: Date) {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: SHIP_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

/** The most recent batch date on or before today: the one staff should dispatch. */
export function currentBatchDate(at = new Date()) {
  const t = tzToday(at);
  const y = t.getUTCFullYear(), m = t.getUTCMonth(), d = t.getUTCDate();
  return iso(d >= SHIP_DAYS[1] ? Date.UTC(y, m, SHIP_DAYS[1]) : d >= SHIP_DAYS[0] ? Date.UTC(y, m, SHIP_DAYS[0]) : Date.UTC(y, m - 1, SHIP_DAYS[1]));
}

/** The next batch date strictly after today: the shipment the warehouse is filling. */
export function upcomingBatchDate(at = new Date()) {
  const t = tzToday(at);
  const y = t.getUTCFullYear(), m = t.getUTCMonth(), d = t.getUTCDate();
  return iso(d < SHIP_DAYS[0] ? Date.UTC(y, m, SHIP_DAYS[0]) : d < SHIP_DAYS[1] ? Date.UTC(y, m, SHIP_DAYS[1]) : Date.UTC(y, m + 1, SHIP_DAYS[0]));
}

/** Batch dates after `from` (YYYY-MM-DD), for rescheduling an order. */
export function batchDatesAfter(from: string, count = 4) {
  const out: string[] = [];
  const [y, m] = from.split('-').map(Number);
  for (let i = 0; out.length < count; i++) {
    for (const day of SHIP_DAYS) {
      const d = iso(Date.UTC(y, m - 1 + i, day));
      if (d > from && out.length < count) out.push(d);
    }
  }
  return out;
}

/** Last day an order can be placed to make the batch on `shipDate`. */
export function shipCutoff(shipDate: string) {
  return iso(Date.parse(shipDate) - SHIP_CUTOFF_DAYS * 864e5);
}

/** "Sat 14 Nov" — formats a date-only value without the device timezone shifting it a day. */
export function formatBatch(date: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }) {
  return new Intl.DateTimeFormat('en-GB', { ...opts, timeZone: 'UTC' }).format(new Date(`${date.slice(0, 10)}T00:00:00Z`));
}
