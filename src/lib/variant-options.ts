/**
 * Multi-option variants (e.g. Color × Size) on top of the existing single name/value variant columns.
 *
 * A combination is stored as  name = "Color / Size",  value = "Red / M".  Single-option variants
 * ("Size" / "M") keep working unchanged. Because it's stored this way, carts, orders and receipts
 * read naturally ("Color / Size: Red / M") without any database change.
 * Option names and values can't contain "/" (the admin editors enforce this).
 */
export const OPTION_SEP = " / ";

export type VariantLike = { id: string; name: string; value: string; stock_quantity: number; image_url?: string | null };
export type OptionGroup = { name: string; values: string[] };
export type Selection = Record<string, string>;
export type ValueState = "available" | "soldout" | "unavailable";

/** The option name/value pairs of one variant. */
export function optionsOf(v: Pick<VariantLike, "name" | "value">): { name: string; value: string }[] {
  const names = v.name.split(OPTION_SEP).map((s) => s.trim());
  const values = v.value.split(OPTION_SEP).map((s) => s.trim());
  if (names.length !== values.length) return [{ name: v.name.trim(), value: v.value.trim() }];
  return names.map((name, i) => ({ name, value: values[i] }));
}

const optionValue = (v: VariantLike, name: string) => optionsOf(v).find((o) => o.name === name)?.value;

/** Option groups (in the order they first appear) with their values (in variant order). */
export function optionGroups(variants: VariantLike[]): OptionGroup[] {
  const groups: OptionGroup[] = [];
  for (const v of variants) {
    for (const o of optionsOf(v)) {
      let g = groups.find((x) => x.name === o.name);
      if (!g) groups.push((g = { name: o.name, values: [] }));
      if (!g.values.includes(o.value)) g.values.push(o.value);
    }
  }
  return groups;
}

/** Variants matching every chosen option (ignoring `except`, if given). */
function matching(variants: VariantLike[], sel: Selection, except?: string) {
  return variants.filter((v) => Object.entries(sel).every(([name, value]) => name === except || optionValue(v, name) === value));
}

/** The exact variant for a selection, once every option is chosen. */
export function findVariant(variants: VariantLike[], sel: Selection): VariantLike | null {
  const groups = optionGroups(variants);
  if (!groups.length || groups.some((g) => !sel[g.name])) return null;
  return matching(variants, sel)[0] ?? null;
}

/**
 * Whether choosing `value` for option `name` works with the other options already chosen:
 * "available", "soldout" (the combination exists but has no stock) or "unavailable" (it doesn't exist).
 */
export function valueState(variants: VariantLike[], sel: Selection, name: string, value: string): ValueState {
  const candidates = matching(variants, sel, name).filter((v) => optionValue(v, name) === value);
  if (!candidates.length) return "unavailable";
  return candidates.some((v) => v.stock_quantity > 0) ? "available" : "soldout";
}

/** Choose a value; other choices that no longer form an existing combination are cleared. */
export function selectValue(variants: VariantLike[], sel: Selection, name: string, value: string): Selection {
  const next: Selection = { ...sel, [name]: value };
  for (const other of Object.keys(next)) {
    if (other === name) continue;
    if (!matching(variants, next).length) delete next[other];
  }
  return next;
}

/** Starting selection: options with only one value (or a product with a single variant) are pre-chosen. */
export function initialSelection(variants: VariantLike[]): Selection {
  if (variants.length === 1) return Object.fromEntries(optionsOf(variants[0]).map((o) => [o.name, o.value]));
  return Object.fromEntries(optionGroups(variants).filter((g) => g.values.length === 1).map((g) => [g.name, g.values[0]]));
}

/** Photo to show for a (possibly partial) selection, e.g. Color chosen but not Size yet. */
export function imageFor(variants: VariantLike[], sel: Selection): string | null {
  return matching(variants, sel).find((v) => v.image_url)?.image_url ?? null;
}

/** Every combination of the given option groups, as variant name/value pairs (for the admin "generate" button). */
export function combinations(groups: OptionGroup[]): { name: string; value: string }[] {
  const usable = groups.map((g) => ({ name: g.name.trim(), values: g.values.map((v) => v.trim()).filter(Boolean) })).filter((g) => g.name && g.values.length);
  if (!usable.length) return [];
  let rows: string[][] = [[]];
  for (const g of usable) rows = rows.flatMap((r) => g.values.map((v) => [...r, v]));
  const name = usable.map((g) => g.name).join(OPTION_SEP);
  return rows.map((r) => ({ name, value: r.join(OPTION_SEP) }));
}

/** Option names/values may not contain "/" because it separates options. */
export const validOptionText = (s: string) => s.trim().length > 0 && !s.includes("/");

/**
 * The option that decides the photo (usually Color): every value maps to one photo, and values differ.
 * Only that option shows photo thumbnails; null when no option fits.
 */
export function photoOption(variants: VariantLike[]): string | null {
  for (const g of optionGroups(variants)) {
    const photos = g.values.map((value) => new Set(variants.filter((v) => v.image_url && optionValue(v, g.name) === value).map((v) => v.image_url)));
    if (photos.every((s) => s.size <= 1) && new Set(photos.flatMap((s) => [...s])).size > 1) return g.name;
  }
  return null;
}

/** The photo for one value of the photo option (e.g. the "Red" thumbnail). */
export function photoForValue(variants: VariantLike[], name: string, value: string): string | null {
  return variants.find((v) => v.image_url && optionValue(v, name) === value)?.image_url ?? null;
}
