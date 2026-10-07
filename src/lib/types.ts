export type OrderStatus = "pending" | "confirmed" | "processing" | "shipped" | "delivered" | "cancelled";
export type DeliveryMethod = "standard" | "express" | "sea";

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  sort_order: number;
  product_count?: number;
}

export interface ProductImage {
  id: string;
  image_url: string;
  alt_text: string;
  sort_order: number;
}

export interface ProductVariant {
  id: string;
  name: string;
  value: string;
  additional_price: number;
  stock_quantity: number;
  sort_order: number;
}

/** Shape used by cards and grids. */
export interface ProductSummary {
  id: string;
  slug: string;
  name: string;
  brand: string;
  price: number;
  compare_at_price: number | null;
  discount_percent: number;
  rating: number;
  review_count: number;
  stock_quantity: number;
  is_featured: boolean;
  is_new: boolean;
  created_at: string;
  category: Pick<Category, "id" | "name" | "slug"> | null;
  images: ProductImage[];
  variants: ProductVariant[];
}

export interface Product extends ProductSummary {
  description: string;
  details: string[];
  specifications: Record<string, string>;
  sku: string | null;
  sales_count: number;
  is_active: boolean;
  updated_at: string;
  weight_kg: number;
  length_cm: number;
  width_cm: number;
  height_cm: number;
  volume_cbm: number;
  shipping_methods: DeliveryMethod[];
}

/** One priced option from the shipping_options / quote_order database functions. */
export interface ShippingOption {
  method: DeliveryMethod;
  available: boolean;
  blocked_by: string[];
  /** Full calculated price before any free-shipping promotion. */
  list_price: number;
  free: boolean;
  price: number;
  chargeable: number;
  unit: "kg" | "cbm";
  rate: number;
  min_charge: number;
  free_over: number | null;
  free_max_kg: number | null;
  free_max_cbm: number | null;
  eta_min: number;
  eta_max: number;
  weight_kg: number;
  volume_cbm: number;
}

export interface ShippingRate {
  method: DeliveryMethod;
  rate_per_kg: number | null;
  rate_per_cbm: number | null;
  volumetric_kg_per_cbm: number;
  min_charge: number;
  free_over: number | null;
  free_max_kg: number | null;
  free_max_cbm: number | null;
  eta_min_days: number;
  eta_max_days: number;
  is_active: boolean;
  sort_order: number;
}

export interface Review {
  id: string;
  author_name: string;
  rating: number;
  title: string;
  content: string;
  created_at: string;
  user_id: string | null;
}

export interface ProductQuestion {
  id: string;
  author_name: string;
  question: string;
  answer: string | null;
  answered_at: string | null;
  created_at: string;
}

export interface Address {
  id: string;
  label: string;
  full_name: string;
  line1: string;
  line2: string | null;
  city: string;
  region: string | null;
  postal_code: string;
  country: string;
  phone: string | null;
  is_default: boolean;
}

export interface PaymentMethod {
  id: string;
  brand: string;
  last4: string;
  exp_month: number;
  exp_year: number;
  cardholder_name: string | null;
  is_default: boolean;
}

export interface OrderItem {
  id: string;
  product_id: string | null;
  product_name: string;
  product_slug: string | null;
  image_url: string | null;
  quantity: number;
  price: number;
  variant: string | null;
}

export interface Order {
  id: string;
  order_number: string;
  status: OrderStatus;
  email: string;
  subtotal: number;
  discount: number;
  shipping: number;
  tax: number;
  total: number;
  coupon_code: string | null;
  delivery_method: DeliveryMethod;
  shipping_saved?: number;
  shipping_address: Omit<Address, "id" | "label" | "is_default">;
  payment_method: { brand?: string; last4?: string };
  payment_status: string;
  /** Snippe payment reference, set once the customer starts paying. */
  payment_reference?: string | null;
  created_at: string;
  updated_at: string;
  user_id: string | null;
  items: OrderItem[];
}

export interface Profile {
  id: string;
  user_id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  role: "customer" | "admin" | "super_admin";
  status: "active" | "suspended";
  permissions?: string[];
  marketing_opt_in: boolean;
  created_at: string;
}

/** A line in the client-side bag. Snapshot fields are display-only; prices are re-quoted by the server. */
export interface CartLine {
  productId: string;
  variantId: string | null;
  quantity: number;
  savedForLater: boolean;
  name: string;
  slug: string;
  brand: string;
  image: string | null;
  unitPrice: number;
  compareAtPrice: number | null;
  variantLabel: string | null;
  maxQuantity: number;
}

export interface QuoteLine {
  product_id: string;
  variant_id: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
  product_name: string;
  product_slug: string;
  variant_label: string | null;
  image_url: string | null;
  available: number;
}

export interface Quote {
  lines: QuoteLine[];
  subtotal: number;
  discount: number;
  coupon_code: string | null;
  coupon_message: string | null;
  delivery_method: DeliveryMethod;
  shipping: number;
  /** Shipping before promotions, when known (equals `shipping` unless free shipping applied). */
  shipping_list?: number;
  shipping_available: boolean;
  shipping_options: ShippingOption[];
  tax: number;
  total: number;
}

export interface SearchSuggestion {
  id: string;
  name: string;
  slug: string;
  brand: string;
  price: number;
  compare_at_price: number | null;
  image_url: string | null;
  category_name: string | null;
  category_slug: string | null;
}

export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };
