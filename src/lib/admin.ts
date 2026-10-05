/**
 * Admin data layer — a port of the website's server actions (src/actions/admin.ts in the web repo).
 *
 * Security: this app only ever holds the public anon key. Every write below runs as the signed-in user and is
 * checked by Row Level Security (`public.is_admin()`, which requires role = 'admin' AND status = 'active'),
 * plus column-level grants. A non-admin who somehow reached these screens would get permission errors.
 */
import { supabase } from '@/lib/supabase';
import { LOW_STOCK, ORDERS_PER_PAGE, ORDER_STATUSES, PRODUCTS_PER_PAGE, SITE } from '@/lib/constants';
import type { Category, DeliveryMethod, Order, OrderStatus, Product, ProductQuestion, Profile, ShippingRate } from '@/lib/types';
import type { Permission, StaffRole } from '@/lib/permissions';

// ---------------------------------------------------------------------------------------------------------------
// Helpers

export class AdminError extends Error {}

function fail(error: unknown, fallback: string): never {
  const e = error as { code?: string; message?: string };
  if (e?.code === '23505') throw new AdminError('That slug, SKU or code is already in use.');
  if (e?.code === '42501') throw new AdminError('You do not have permission to do that.');
  throw new AdminError(e?.message && e.message.length < 160 ? e.message : fallback);
}

/** Strip characters that would break a PostgREST `or=(...)` filter. */
const clean = (q: string) => q.trim().replace(/[%,()]/g, '').slice(0, 80);

export function slugify(input: string) {
  return input.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 120);
}

const num = (v: unknown) => (v == null || v === '' ? NaN : Number(v));

/**
 * Ask the storefront to drop its catalog cache so edits show immediately (otherwise they appear within ~5 minutes).
 * Best effort: the website verifies our token belongs to an admin; failures are ignored.
 */
export async function refreshStore() {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    await fetch(`${SITE.url}/api/admin/revalidate`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  } catch {
    /* the store's cache expires on its own */
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Session

export type AdminProfile = Pick<Profile, 'user_id' | 'email' | 'full_name' | 'avatar_url' | 'status'> & { role: StaffRole; permissions: string[] };

export async function getMyProfile(userId: string): Promise<AdminProfile | null> {
  const cols = 'user_id, email, full_name, avatar_url, role, status';
  const first = await supabase.from('profiles').select(`${cols}, permissions`).eq('user_id', userId).maybeSingle();
  let data: Record<string, unknown> | null = first.data;
  // Before migration 0009 there is no permissions column (42703).
  if (first.error?.code === '42703') data = (await supabase.from('profiles').select(cols).eq('user_id', userId).maybeSingle()).data;
  return data ? ({ ...data, permissions: (data.permissions as string[] | undefined) ?? [] } as AdminProfile) : null;
}

// ---------------------------------------------------------------------------------------------------------------
// Staff (super admins only; admin_set_staff re-checks in the database)

export type StaffMember = { user_id: string; full_name: string | null; email: string | null; role: StaffRole; status: string; permissions: string[]; created_at: string };

export async function listStaff(): Promise<StaffMember[]> {
  const { data, error } = await supabase.from('profiles').select('user_id, full_name, email, role, status, permissions, created_at')
    .in('role', ['admin', 'super_admin']).order('role', { ascending: false }).order('created_at');
  if (error) fail(error, 'Could not load staff');
  return (data ?? []) as StaffMember[];
}

export async function setStaff(email: string, role: StaffRole, permissions: Permission[]) {
  const e = email.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(e)) throw new AdminError('Enter the email they signed up with');
  const { error } = await supabase.rpc('admin_set_staff', { p_email: e, p_role: role, p_permissions: role === 'admin' ? permissions : [] });
  if (error) fail(error, "We couldn't update this staff member.");
}

// ---------------------------------------------------------------------------------------------------------------
// Overview

export type Metrics = {
  revenue: number; revenue_prev: number; orders: number; orders_prev: number; customers: number; new_customers: number;
  products: number; low_stock: number; aov: number; repeat_rate: number; cart_to_order: number;
  daily: { day: string; revenue: number; orders: number }[];
  status_breakdown: Partial<Record<OrderStatus, number>>;
  top_products: { name: string; units: number; revenue: number }[];
};

export type OrderRow = Pick<Order, 'id' | 'order_number' | 'email' | 'total' | 'status' | 'payment_status' | 'created_at'> & {
  customer_name?: string; item_count?: number;
};

export async function getOverview(days = 30) {
  const [m, recent, lowStock] = await Promise.all([
    supabase.rpc('admin_metrics', { days }),
    supabase.from('orders').select('id, order_number, email, total, status, payment_status, created_at').order('created_at', { ascending: false }).limit(6),
    supabase.from('products').select('id, name, stock_quantity').eq('is_active', true).lt('stock_quantity', LOW_STOCK).order('stock_quantity').limit(6),
  ]);
  if (m.error) fail(m.error, 'Could not load metrics');
  const metrics = m.data as Metrics;
  metrics.daily = metrics.daily.map((d) => ({ ...d, revenue: Number(d.revenue) }));
  return {
    metrics,
    recent: (recent.data ?? []) as OrderRow[],
    lowStock: (lowStock.data ?? []) as { id: string; name: string; stock_quantity: number }[],
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Orders

export async function listOrders({ status, q, page }: { status: OrderStatus | null; q: string; page: number }) {
  let query = supabase.from('orders')
    .select('id, order_number, email, total, status, payment_status, created_at, shipping_address, items:order_items(quantity)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(page * ORDERS_PER_PAGE, (page + 1) * ORDERS_PER_PAGE - 1);
  if (status) query = query.eq('status', status);
  const s = clean(q);
  if (s) query = query.or(`order_number.ilike.%${s}%,email.ilike.%${s}%`);
  const { data, count, error } = await query;
  if (error) fail(error, 'Could not load orders');
  const rows: OrderRow[] = (data ?? []).map((o) => ({
    id: o.id, order_number: o.order_number, email: o.email, total: Number(o.total), status: o.status, payment_status: o.payment_status, created_at: o.created_at,
    customer_name: (o.shipping_address as { full_name?: string } | null)?.full_name,
    item_count: ((o.items ?? []) as { quantity: number }[]).reduce((n, i) => n + i.quantity, 0),
  }));
  return { rows, total: count ?? 0 };
}

export async function getOrder(id: string) {
  const { data, error } = await supabase.from('orders').select('*, items:order_items(*)').eq('id', id).maybeSingle();
  if (error) fail(error, 'Could not load this order');
  if (!data) return null;
  const order = data as Order;
  const customer = order.user_id
    ? ((await supabase.from('profiles').select('user_id, full_name, email, status').eq('user_id', order.user_id).maybeSingle()).data as Pick<Profile, 'user_id' | 'full_name' | 'email' | 'status'> | null)
    : null;
  return { order, customer };
}

export async function updateOrderStatus(id: string, status: OrderStatus) {
  if (!ORDER_STATUSES.includes(status)) throw new AdminError('Unknown status');
  const update: Record<string, string> = { status };
  if (status === 'cancelled') update.payment_status = 'refunded';
  const { error } = await supabase.from('orders').update(update).eq('id', id);
  if (error) fail(error, "We couldn't update this order.");
}

// ---------------------------------------------------------------------------------------------------------------
// Products

export type ProductFilter = 'all' | 'active' | 'draft' | 'low' | 'sale';
export type ProductRow = {
  id: string; name: string; slug: string; brand: string; price: number; compare_at_price: number | null; stock_quantity: number;
  is_active: boolean; is_featured: boolean; sales_count: number; category: string | null; image: string | null; variant_count: number;
};

export async function listProducts({ q, filter, page }: { q: string; filter: ProductFilter; page: number }) {
  let query = supabase.from('products')
    .select('id, name, slug, brand, price, compare_at_price, stock_quantity, is_active, is_featured, sales_count, category:categories(name), images:product_images(image_url, sort_order), variants:product_variants(id)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(page * PRODUCTS_PER_PAGE, (page + 1) * PRODUCTS_PER_PAGE - 1);
  const s = clean(q);
  if (s) query = query.or(`name.ilike.%${s}%,brand.ilike.%${s}%,sku.ilike.%${s}%`);
  if (filter === 'active') query = query.eq('is_active', true);
  if (filter === 'draft') query = query.eq('is_active', false);
  if (filter === 'low') query = query.lt('stock_quantity', LOW_STOCK);
  if (filter === 'sale') query = query.gt('discount_percent', 0);
  const { data, count, error } = await query;
  if (error) fail(error, 'Could not load products');
  const rows: ProductRow[] = (data ?? []).map((p) => ({
    id: p.id, name: p.name, slug: p.slug, brand: p.brand, price: Number(p.price),
    compare_at_price: p.compare_at_price == null ? null : Number(p.compare_at_price),
    stock_quantity: p.stock_quantity, is_active: p.is_active, is_featured: p.is_featured, sales_count: p.sales_count,
    category: (p.category as unknown as { name: string } | null)?.name ?? null,
    image: [...((p.images ?? []) as { image_url: string; sort_order: number }[])].sort((a, b) => a.sort_order - b.sort_order)[0]?.image_url ?? null,
    variant_count: (p.variants ?? []).length,
  }));
  return { rows, total: count ?? 0 };
}

const PRODUCT_SELECT = `*, category:categories(id, name, slug),
  images:product_images(id, image_url, alt_text, sort_order),
  variants:product_variants(id, name, value, additional_price, stock_quantity, sort_order)`;

export async function getProduct(id: string): Promise<Product | null> {
  const { data, error } = await supabase.from('products').select(PRODUCT_SELECT).eq('id', id).maybeSingle();
  if (error) fail(error, 'Could not load this product');
  if (!data) return null;
  const p = data as Product;
  return {
    ...p,
    price: Number(p.price),
    compare_at_price: p.compare_at_price == null ? null : Number(p.compare_at_price),
    weight_kg: Number(p.weight_kg ?? 0.5), length_cm: Number(p.length_cm ?? 20), width_cm: Number(p.width_cm ?? 15), height_cm: Number(p.height_cm ?? 10),
    shipping_methods: p.shipping_methods ?? ['standard', 'express', 'sea'],
    images: [...(p.images ?? [])].sort((a, b) => a.sort_order - b.sort_order),
    variants: [...(p.variants ?? [])].sort((a, b) => a.sort_order - b.sort_order).map((v) => ({ ...v, additional_price: Number(v.additional_price) })),
  };
}

export type ProductPayload = {
  id?: string; name: string; slug: string; brand: string; category_id: string | null; description: string;
  details: string[]; specifications: Record<string, string>;
  price: number; compare_at_price: number | null; sku: string | null; stock_quantity: number; is_featured: boolean; is_active: boolean;
  weight_kg: number; length_cm: number; width_cm: number; height_cm: number; shipping_methods: DeliveryMethod[];
  images: { image_url: string; alt_text: string }[];
  variants: { id?: string; name: string; value: string; additional_price: number; stock_quantity: number }[];
};

/** Same rules as the website's productSchema. Returns an error message, or null when valid. */
function validateProduct(p: ProductPayload): string | null {
  if (p.name.trim().length < 2) return 'Name is required';
  if (p.name.length > 160) return 'Name is too long';
  if (!(p.price >= 0) || p.price > 1_000_000_000) return 'Price must be a positive number';
  if (p.compare_at_price != null && !(p.compare_at_price >= 0)) return 'Compare-at price must be positive';
  if (!Number.isInteger(p.stock_quantity) || p.stock_quantity < 0) return 'Stock must be a whole number';
  if (!(p.weight_kg > 0) || p.weight_kg > 5000) return 'Weight must be greater than 0';
  for (const [k, v] of [['Length', p.length_cm], ['Width', p.width_cm], ['Height', p.height_cm]] as const) {
    if (!(v > 0) || v > 1000) return `${k} must be greater than 0`;
  }
  if (!p.shipping_methods.length) return 'Allow at least one shipping method';
  if (p.images.length > 12) return 'Use at most 12 images';
  if (p.details.length > 20) return 'Use at most 20 highlights';
  if (p.variants.length > 50) return 'Use at most 50 variants';
  for (const v of p.variants) {
    if (!v.name.trim() || !v.value.trim()) return 'Every variant needs an option and a value';
    if (!Number.isInteger(v.stock_quantity) || v.stock_quantity < 0) return 'Variant stock must be a whole number';
    if (!Number.isFinite(v.additional_price)) return 'Variant extra price must be a number';
  }
  return null;
}

export async function saveProduct(payload: ProductPayload): Promise<string> {
  const invalid = validateProduct(payload);
  if (invalid) throw new AdminError(invalid);
  const { id, images, variants, ...p } = payload;
  const row = {
    ...p,
    name: p.name.trim(),
    brand: p.brand.trim(),
    description: p.description.trim(),
    compare_at_price: p.compare_at_price != null && p.compare_at_price > p.price ? p.compare_at_price : null,
    slug: slugify(p.slug || p.name),
    sku: p.sku?.trim() || null,
    // With variants, product stock is the sum of variant stock.
    stock_quantity: variants.length ? variants.reduce((n, v) => n + v.stock_quantity, 0) : p.stock_quantity,
  };

  try {
    let productId = id;
    if (id) {
      const { error } = await supabase.from('products').update(row).eq('id', id);
      if (error) throw error;
    } else {
      const { data, error } = await supabase.from('products').insert(row).select('id').single();
      if (error) throw error;
      productId = data.id as string;
    }

    // Images: replace the set, keeping order.
    const { error: delImg } = await supabase.from('product_images').delete().eq('product_id', productId!);
    if (delImg) throw delImg;
    if (images.length) {
      const { error } = await supabase.from('product_images').insert(images.map((img, i) => ({ product_id: productId, image_url: img.image_url, alt_text: img.alt_text, sort_order: i })));
      if (error) throw error;
    }

    // Variants: update existing ids in place (cart lines reference them), insert new, delete removed.
    const keep = variants.filter((v) => v.id).map((v) => v.id!);
    let del = supabase.from('product_variants').delete().eq('product_id', productId!);
    if (keep.length) del = del.not('id', 'in', `(${keep.join(',')})`);
    const { error: delVar } = await del;
    if (delVar) throw delVar;
    for (const [i, v] of variants.entries()) {
      const data = { product_id: productId, name: v.name.trim(), value: v.value.trim(), additional_price: v.additional_price, stock_quantity: v.stock_quantity, sort_order: i };
      const { error } = v.id ? await supabase.from('product_variants').update(data).eq('id', v.id) : await supabase.from('product_variants').insert(data);
      if (error) throw error;
    }

    void refreshStore();
    return productId!;
  } catch (e) {
    fail(e, "We couldn't save this product.");
  }
}

export async function deleteProduct(id: string) {
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) fail(error, "We couldn't delete this product.");
  void refreshStore();
}

export async function setProductActive(id: string, active: boolean) {
  const { error } = await supabase.from('products').update({ is_active: active }).eq('id', id);
  if (error) fail(error, "We couldn't update this product.");
  void refreshStore();
}

export async function adjustStock(id: string, stock: number) {
  if (!Number.isInteger(stock) || stock < 0) throw new AdminError('Stock must be a whole number.');
  const { error } = await supabase.from('products').update({ stock_quantity: stock }).eq('id', id);
  if (error) fail(error, "We couldn't update stock.");
  void refreshStore();
}

// ---------------------------------------------------------------------------------------------------------------
// Questions

export type QuestionRow = ProductQuestion & { product?: { id: string; name: string } | null };

export async function getProductQuestions(productId: string) {
  const { data } = await supabase.from('product_questions').select('id, author_name, question, answer, answered_at, created_at').eq('product_id', productId).order('created_at', { ascending: false });
  return (data ?? []) as ProductQuestion[];
}

export async function listQuestions(unansweredOnly: boolean) {
  let query = supabase.from('product_questions').select('id, author_name, question, answer, answered_at, created_at, product:products(id, name)').order('created_at', { ascending: false }).limit(100);
  if (unansweredOnly) query = query.is('answer', null);
  const { data, error } = await query;
  if (error) fail(error, 'Could not load questions');
  return (data ?? []) as unknown as QuestionRow[];
}

export async function answerQuestion(id: string, answer: string) {
  const text = answer.trim();
  if (text.length < 2) throw new AdminError('Write an answer first.');
  const { error } = await supabase.from('product_questions').update({ answer: text, answered_at: new Date().toISOString() }).eq('id', id);
  if (error) fail(error, "We couldn't save the answer.");
  void refreshStore();
}

// ---------------------------------------------------------------------------------------------------------------
// Categories

export async function listCategories(): Promise<Category[]> {
  const [{ data, error }, counts] = await Promise.all([
    supabase.from('categories').select('*').order('sort_order'),
    supabase.rpc('category_counts'),
  ]);
  if (error) fail(error, 'Could not load categories');
  const map = new Map(((counts.data ?? []) as { category_id: string; product_count: number }[]).map((c) => [c.category_id, Number(c.product_count)]));
  return ((data ?? []) as Category[]).map((c) => ({ ...c, product_count: map.get(c.id) ?? 0 }));
}

export async function saveCategory(c: { id?: string; name: string; slug: string; description: string; image_url: string }) {
  const name = c.name.trim();
  if (name.length < 2) throw new AdminError('Name is required');
  if (name.length > 80) throw new AdminError('Name is too long');
  if (c.description.length > 500) throw new AdminError('Description is too long');
  const row = { name, slug: slugify(c.slug || name).slice(0, 80), description: c.description.trim() || null, image_url: c.image_url || null };
  let error;
  if (c.id) ({ error } = await supabase.from('categories').update(row).eq('id', c.id));
  else {
    const { count } = await supabase.from('categories').select('id', { count: 'exact', head: true });
    ({ error } = await supabase.from('categories').insert({ ...row, sort_order: count ?? 0 }));
  }
  if (error) fail(error, "We couldn't save this category.");
  void refreshStore();
}

export async function deleteCategory(id: string) {
  const { error } = await supabase.from('categories').delete().eq('id', id);
  if (error) fail(error, "We couldn't delete this category.");
  void refreshStore();
}

export async function reorderCategories(ids: string[]) {
  const { error } = await supabase.rpc('admin_reorder_categories', { ids });
  if (error) fail(error, "We couldn't reorder categories.");
  void refreshStore();
}

// ---------------------------------------------------------------------------------------------------------------
// Customers

export type CustomerRow = Pick<Profile, 'user_id' | 'full_name' | 'email' | 'role' | 'status' | 'created_at'> & { orders: number; spent: number };

export async function listCustomers(q: string) {
  let query = supabase.from('profiles').select('user_id, full_name, email, role, status, created_at', { count: 'exact' }).order('created_at', { ascending: false }).limit(100);
  const s = clean(q);
  if (s) query = query.or(`full_name.ilike.%${s}%,email.ilike.%${s}%`);
  const { data, count, error } = await query;
  if (error) fail(error, 'Could not load customers');
  const ids = (data ?? []).map((c) => c.user_id);
  const { data: orders } = ids.length ? await supabase.from('orders').select('user_id, total').in('user_id', ids).neq('status', 'cancelled') : { data: [] };
  const stats = new Map<string, { n: number; spent: number }>();
  for (const o of orders ?? []) {
    const st = stats.get(o.user_id) ?? { n: 0, spent: 0 };
    st.n++; st.spent += Number(o.total);
    stats.set(o.user_id, st);
  }
  const rows: CustomerRow[] = ((data ?? []) as Profile[]).map((c) => ({ ...c, orders: stats.get(c.user_id)?.n ?? 0, spent: stats.get(c.user_id)?.spent ?? 0 }));
  return { rows, total: count ?? 0 };
}

export async function getCustomer(id: string) {
  const [{ data: c, error }, { data: orders }] = await Promise.all([
    supabase.from('profiles').select('*').eq('user_id', id).maybeSingle(),
    supabase.from('orders').select('id, order_number, total, status, payment_status, created_at, email, items:order_items(quantity)').eq('user_id', id).order('created_at', { ascending: false }),
  ]);
  if (error) fail(error, 'Could not load this customer');
  if (!c) return null;
  const list: OrderRow[] = (orders ?? []).map((o) => ({
    id: o.id, order_number: o.order_number, email: o.email, total: Number(o.total), status: o.status, payment_status: o.payment_status, created_at: o.created_at,
    item_count: ((o.items ?? []) as { quantity: number }[]).reduce((n, i) => n + i.quantity, 0),
  }));
  const valid = list.filter((o) => o.status !== 'cancelled');
  const spent = valid.reduce((n, o) => n + o.total, 0);
  return { profile: c as Profile, orders: list, spent, average: valid.length ? spent / valid.length : 0 };
}

export async function setCustomerStatus(userId: string, status: 'active' | 'suspended') {
  const { error } = await supabase.rpc('admin_set_customer_status', { p_user_id: userId, p_status: status });
  if (error) fail(error, "We couldn't update this customer.");
}

// ---------------------------------------------------------------------------------------------------------------
// Discounts

export type CouponStats = { orders: number; revenue: number; discount_given: number; last_order_at: string | null; assigned_admin_name: string | null };
export type Coupon = {
  id: string; code: string; description: string | null; type: 'percentage' | 'fixed'; value: number; min_subtotal: number;
  expires_at: string | null; usage_limit: number | null; used_count: number; is_active: boolean;
  assigned_admin_id: string | null; stats: CouponStats;
};

/** Codes visible to this admin (RLS: all codes for discount managers, otherwise only their own), with sales per code. */
export async function listCoupons(): Promise<Coupon[]> {
  const [{ data, error }, report] = await Promise.all([
    supabase.from('coupons').select('*').order('created_at', { ascending: false }),
    supabase.rpc('admin_coupon_report'),
  ]);
  if (error) fail(error, 'Could not load discounts');
  const stats = new Map(((report.data ?? []) as (CouponStats & { id: string })[]).map((r) => [r.id, r]));
  return ((data ?? []) as Coupon[]).map((c) => {
    const st = stats.get(c.id);
    return {
      ...c, value: Number(c.value), min_subtotal: Number(c.min_subtotal),
      stats: { orders: Number(st?.orders ?? 0), revenue: Number(st?.revenue ?? 0), discount_given: Number(st?.discount_given ?? 0), last_order_at: st?.last_order_at ?? null, assigned_admin_name: st?.assigned_admin_name ?? null },
    };
  });
}

export type CouponOrder = { id: string; order_number: string; created_at: string; total: number; discount: number; status: OrderStatus };

/** Orders placed with one code (allowed for discount managers and the admin the code is assigned to). */
export async function getCouponOrders(code: string): Promise<CouponOrder[]> {
  const { data, error } = await supabase.rpc('admin_coupon_orders', { p_code: code });
  if (error) fail(error, 'Could not load orders for this code');
  return ((data ?? []) as CouponOrder[]).map((o) => ({ ...o, total: Number(o.total), discount: Number(o.discount) }));
}

export type CouponInput = {
  id?: string; code: string; description: string; type: 'percentage' | 'fixed'; value: string; min_subtotal: string;
  expires_at: string; usage_limit: string; is_active: boolean;
  /** Staff member credited with orders placed using this code. Non-super admins can only assign to themselves (RLS). */
  assigned_admin_id: string;
};

export async function saveCoupon(c: CouponInput) {
  const code = c.code.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,32}$/.test(code)) throw new AdminError('Code: use 3–32 letters, numbers, - or _');
  const value = num(c.value);
  if (!(value > 0)) throw new AdminError('Value must be greater than 0');
  if (c.type === 'percentage' && value > 100) throw new AdminError("Percentage can't exceed 100");
  const min = c.min_subtotal.trim() ? num(c.min_subtotal) : 0;
  if (!(min >= 0)) throw new AdminError('Minimum spend must be 0 or more');
  const limit = c.usage_limit.trim() ? num(c.usage_limit) : null;
  if (limit !== null && (!Number.isInteger(limit) || limit < 1)) throw new AdminError('Usage limit must be a whole number');
  let expires: string | null = null;
  if (c.expires_at.trim()) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(c.expires_at.trim())) throw new AdminError('Expiry date must look like 2026-12-31');
    const d = new Date(`${c.expires_at.trim()}T23:59:59`);
    if (Number.isNaN(d.getTime())) throw new AdminError("That expiry date isn't valid");
    expires = d.toISOString();
  }
  if (!c.assigned_admin_id) throw new AdminError('Choose who this code is assigned to');
  const row = { code, description: c.description.trim() || null, type: c.type, value, min_subtotal: min, expires_at: expires, usage_limit: limit, is_active: c.is_active, assigned_admin_id: c.assigned_admin_id };
  const { data, error } = c.id ? await supabase.from('coupons').update(row).eq('id', c.id).select('id') : await supabase.from('coupons').insert(row).select('id');
  if (error) fail(error, "We couldn't save this discount.");
  if (!data?.length) throw new AdminError('You can only edit discount codes assigned to you.');
}

export async function deleteCoupon(id: string) {
  const { error } = await supabase.from('coupons').delete().eq('id', id);
  if (error) fail(error, "We couldn't delete this discount.");
}

export function couponState(c: Coupon): { label: string; tone: 'muted' | 'sale' | 'success' } {
  if (!c.is_active) return { label: 'Inactive', tone: 'muted' };
  if (c.expires_at && new Date(c.expires_at) < new Date()) return { label: 'Expired', tone: 'sale' };
  if (c.usage_limit && c.used_count >= c.usage_limit) return { label: 'Used up', tone: 'sale' };
  return { label: 'Active', tone: 'success' };
}

// ---------------------------------------------------------------------------------------------------------------
// Shipping

export async function getShippingRates(): Promise<ShippingRate[]> {
  const { data, error } = await supabase.from('shipping_rates').select('*').order('sort_order');
  if (error) fail(error, "Shipping rates aren't set up yet. Apply supabase/migrations/0006_shipping.sql.");
  return ((data ?? []) as ShippingRate[]).map((r) => ({
    ...r,
    rate_per_kg: r.rate_per_kg == null ? null : Number(r.rate_per_kg),
    rate_per_cbm: r.rate_per_cbm == null ? null : Number(r.rate_per_cbm),
    volumetric_kg_per_cbm: Number(r.volumetric_kg_per_cbm), min_charge: Number(r.min_charge),
    free_over: r.free_over == null ? null : Number(r.free_over),
    free_max_cbm: r.free_max_cbm == null ? null : Number(r.free_max_cbm),
  }));
}

export type RateInput = {
  method: DeliveryMethod; rate: string; volumetric_kg_per_cbm: string; min_charge: string; free_over: string; free_max_cbm: string;
  eta_min_days: string; eta_max_days: string; is_active: boolean;
};

export async function saveShippingRate(r: RateInput) {
  const rate = num(r.rate), vol = num(r.volumetric_kg_per_cbm), min = num(r.min_charge);
  const etaMin = num(r.eta_min_days), etaMax = num(r.eta_max_days);
  if (!(rate >= 0)) throw new AdminError('Rate must be 0 or more');
  if (!(vol > 0) || vol > 1000) throw new AdminError('Volumetric kg per m³ must be between 0 and 1000');
  if (!(min >= 0)) throw new AdminError('Minimum charge must be 0 or more');
  if (!Number.isInteger(etaMin) || etaMin < 1 || !Number.isInteger(etaMax) || etaMax < 1) throw new AdminError('Delivery days must be whole numbers');
  if (etaMax < etaMin) throw new AdminError('Max days must be at least min days');
  const perCbm = r.method === 'sea';
  const freeOver = perCbm && r.free_over.trim() !== '' ? num(r.free_over) : null;
  const freeCbm = perCbm && r.free_max_cbm.trim() !== '' ? num(r.free_max_cbm) : null;
  if (freeOver !== null && !(freeOver >= 0)) throw new AdminError('Free-over amount must be 0 or more');
  if (freeCbm !== null && !(freeCbm > 0)) throw new AdminError('Free volume cap must be greater than 0');
  const { error } = await supabase.from('shipping_rates').update({
    volumetric_kg_per_cbm: vol, min_charge: min, eta_min_days: etaMin, eta_max_days: etaMax,
    rate_per_kg: perCbm ? null : rate,
    rate_per_cbm: perCbm ? rate : null,
    // Free shipping is a sea-freight promotion only; air methods are always charged.
    free_over: freeOver,
    free_max_cbm: freeCbm,
    free_max_kg: null,
    is_active: r.is_active,
  }).eq('method', r.method);
  if (error) fail(error, "We couldn't save these rates.");
  void refreshStore();
}

// ---------------------------------------------------------------------------------------------------------------
// Image uploads (product-images / category-images buckets; admin-only by storage policy)

const MIME_EXT: Record<string, string> = { 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif' };

export async function uploadImage(bucket: 'product-images' | 'category-images', asset: { uri: string; mimeType?: string | null; fileSize?: number | null }) {
  const mime = asset.mimeType ?? 'image/jpeg';
  const ext = MIME_EXT[mime];
  if (!ext) throw new AdminError('Use a JPEG, PNG, WebP or AVIF image.');
  const body = await (await fetch(asset.uri)).arrayBuffer();
  if (body.byteLength > 5 * 1024 * 1024) throw new AdminError('That image is larger than 5 MB.');
  const folder = bucket === 'product-images' ? 'products' : 'categories';
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const path = `${folder}/${id}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, body, { contentType: mime, cacheControl: '31536000' });
  if (error) throw new AdminError(`Upload failed: ${error.message}`);
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
