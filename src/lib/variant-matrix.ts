/**
 * Colour × size editor model for the admin product forms (website and herufi-admin).
 *
 *   colours: name + photo        sizes: name + extra price        stock: one cell per colour/size
 *
 * An empty cell means "this colour doesn't come in this size" (no variant); 0 means sold out.
 * It's converted to/from the regular variant rows using the "Color / Size" naming from variant-options.
 */
import { OPTION_SEP, optionGroups, optionsOf, validOptionText } from "./variant-options";

export type MatrixColour = { name: string; image_url: string | null };
export type MatrixSize = { name: string; extra: string };
export type Matrix = {
  colourLabel: string;
  sizeLabel: string;
  colours: MatrixColour[];
  sizes: MatrixSize[];
  /** Stock per "colour|size" cell (or "colour|" / "|size" when only one dimension is used). Empty string = not offered. */
  stock: Record<string, string>;
  /** Existing variant ids per cell, so saving updates rather than recreates them (bags and orders reference them). */
  ids: Record<string, string>;
};

type VariantIn = { id?: string; name: string; value: string; additional_price: number | string; stock_quantity: number | string; image_url?: string | null };
export type VariantOut = { id?: string; name: string; value: string; additional_price: string; stock_quantity: string; image_url: string | null };

export const cellKey = (colour: string, size: string) => `${colour}|${size}`;

export const SIZE_PRESETS: { label: string; sizes: string[] }[] = [
  { label: "S – XL", sizes: ["S", "M", "L", "XL"] },
  { label: "XS – XXL", sizes: ["XS", "S", "M", "L", "XL", "XXL"] },
  { label: "Shoes 38 – 45", sizes: ["38", "39", "40", "41", "42", "43", "44", "45"] },
];

const COLOUR_WORDS = /^(colou?r|rangi)$/i;

export const emptyMatrix = (): Matrix => ({ colourLabel: "Color", sizeLabel: "Size", colours: [], sizes: [], stock: {}, ids: {} });

/** Can these variants be shown in the colour × size editor? (At most two options.) */
export const fitsMatrix = (variants: VariantIn[]) => optionGroups(variants.map((v) => ({ ...v, id: v.id ?? "", stock_quantity: Number(v.stock_quantity) }))).length <= 2;

export function fromVariants(variants: VariantIn[]): Matrix {
  const m = emptyMatrix();
  if (!variants.length) return m;
  const groups = optionGroups(variants.map((v) => ({ ...v, id: v.id ?? "", stock_quantity: Number(v.stock_quantity) })));
  // Which option is the colour? Two options: the first; one option: only if it's called Color/Colour/Rangi.
  const colourGroup = groups.length === 2 ? groups[0] : groups.length === 1 && COLOUR_WORDS.test(groups[0].name) ? groups[0] : null;
  const sizeGroup = groups.length === 2 ? groups[1] : groups.length === 1 && !colourGroup ? groups[0] : null;
  if (colourGroup) m.colourLabel = colourGroup.name;
  if (sizeGroup) m.sizeLabel = sizeGroup.name;
  for (const v of variants) {
    const opts = optionsOf(v);
    const c = colourGroup ? opts.find((o) => o.name === colourGroup.name)?.value ?? "" : "";
    const s = sizeGroup ? opts.find((o) => o.name === sizeGroup.name)?.value ?? "" : "";
    if (c && !m.colours.some((x) => x.name === c)) m.colours.push({ name: c, image_url: v.image_url ?? null });
    if (c && v.image_url) { const col = m.colours.find((x) => x.name === c)!; col.image_url ??= v.image_url; }
    if (s && !m.sizes.some((x) => x.name === s)) m.sizes.push({ name: s, extra: String(Number(v.additional_price) || 0) });
    const key = cellKey(c, s);
    m.stock[key] = String(Number(v.stock_quantity) || 0);
    if (v.id) m.ids[key] = v.id;
  }
  return m;
}

/** Validation message, or null when the matrix can be saved. */
export function matrixError(m: Matrix): string | null {
  const names = [m.colourLabel, m.sizeLabel, ...m.colours.map((c) => c.name), ...m.sizes.map((s) => s.name)];
  const bad = names.find((n) => n.trim() && !validOptionText(n));
  if (bad) return `“${bad}” can't contain “/”`;
  if (m.colours.some((c) => !c.name.trim())) return "Every colour needs a name";
  if (m.sizes.some((s) => !s.name.trim())) return "Every size needs a name";
  const dup = (list: string[]) => list.find((n, i) => list.findIndex((x) => x.trim().toLowerCase() === n.trim().toLowerCase()) !== i);
  const dc = dup(m.colours.map((c) => c.name)); if (dc) return `Colour “${dc}” is listed twice`;
  const ds = dup(m.sizes.map((s) => s.name)); if (ds) return `Size “${ds}” is listed twice`;
  if (m.sizes.some((s) => s.extra.trim() && !Number.isFinite(Number(s.extra)))) return "Size extra prices must be numbers";
  const cells = Object.entries(m.stock).filter(([, v]) => v.trim() !== "");
  if (cells.some(([, v]) => !/^\d+$/.test(v.trim()))) return "Stock must be whole numbers";
  if ((m.colours.length || m.sizes.length) && !toVariants(m).length) return "Enter stock for at least one colour and size (leave a cell empty if that combination doesn't exist)";
  if (toVariants(m).length > 50) return "At most 50 colour/size combinations";
  return null;
}

/** The variant rows the product saves. Size extra price applies to every colour in that size; the colour's photo to every size. */
export function toVariants(m: Matrix): VariantOut[] {
  const C = m.colourLabel.trim() || "Color", S = m.sizeLabel.trim() || "Size";
  const colours = m.colours.filter((c) => c.name.trim());
  const sizes = m.sizes.filter((s) => s.name.trim());
  const out: VariantOut[] = [];
  const push = (c: MatrixColour | null, s: MatrixSize | null) => {
    const key = cellKey(c?.name ?? "", s?.name ?? "");
    const stock = (m.stock[key] ?? "").trim();
    if (stock === "") return; // not offered
    out.push({
      id: m.ids[key],
      name: c && s ? `${C}${OPTION_SEP}${S}` : c ? C : S,
      value: c && s ? `${c.name.trim()}${OPTION_SEP}${s.name.trim()}` : (c?.name ?? s!.name).trim(),
      additional_price: String(Number(s?.extra) || 0),
      stock_quantity: stock,
      image_url: c?.image_url ?? null,
    });
  };
  if (colours.length && sizes.length) colours.forEach((c) => sizes.forEach((s) => push(c, s)));
  else if (colours.length) colours.forEach((c) => push(c, null));
  else sizes.forEach((s) => push(null, s));
  return out;
}

/**
 * Rename the colour or size at `index`, carrying its stock cells (and variant ids) along.
 * Works by position, so two new rows that both start with a blank name stay independent.
 */
export function renameAt(m: Matrix, kind: "colour" | "size", index: number, to: string): Matrix {
  const list = kind === "colour" ? m.colours : m.sizes;
  const from = list[index]?.name;
  if (from === undefined) return m;
  // Only move cells if no other row still uses the old name (e.g. another blank row).
  const shared = list.some((x, i) => i !== index && x.name === from);
  const rekey = (rec: Record<string, string>) => shared ? rec : Object.fromEntries(Object.entries(rec).map(([k, v]) => {
    const [c, s] = k.split("|");
    return [kind === "colour" ? cellKey(c === from ? to : c, s) : cellKey(c, s === from ? to : s), v];
  }));
  return {
    ...m,
    colours: kind === "colour" ? m.colours.map((c, i) => (i === index ? { ...c, name: to } : c)) : m.colours,
    sizes: kind === "size" ? m.sizes.map((s, i) => (i === index ? { ...s, name: to } : s)) : m.sizes,
    stock: rekey(m.stock),
    ids: rekey(m.ids),
  };
}

/** Total stock across offered cells. */
export const matrixStock = (m: Matrix) => toVariants(m).reduce((n, v) => n + (Number(v.stock_quantity) || 0), 0);
