import type { DeliveryMethod, OrderStatus } from '@/lib/types';

export const SITE = {
  name: 'Herufi',
  url: (process.env.EXPO_PUBLIC_SITE_URL ?? 'https://herufi.co.tz').replace(/\/$/, ''),
};

export const ORDER_STATUSES: OrderStatus[] = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'Pending', confirmed: 'Confirmed', processing: 'Processing', shipped: 'Shipped', delivered: 'Delivered', cancelled: 'Cancelled',
};
export const DELIVERY_METHODS: DeliveryMethod[] = ['standard', 'express', 'sea'];
export const DELIVERY_LABEL: Record<DeliveryMethod, string> = { standard: 'Air cargo', express: 'Express air', sea: 'Sea freight' };

/** Products below this count show as "low stock" (matches admin_metrics in the database). */
export const LOW_STOCK = 10;
export const ORDERS_PER_PAGE = 25;
export const PRODUCTS_PER_PAGE = 20;
