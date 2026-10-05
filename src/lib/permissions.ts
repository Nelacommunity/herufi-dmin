/**
 * Staff permissions (same list as the website, src/lib/permissions.ts). Mirrors the check constraint and has_permission() in supabase/migrations/0009_staff_permissions.sql;
 * the database is the real enforcement, this file drives the UI.
 */
export const PERMISSIONS = [
  { key: 'analytics.view', label: 'View dashboard', hint: 'Revenue, orders and store metrics', group: 'Overview' },
  { key: 'orders.view', label: 'View orders', hint: 'See orders and customer delivery details', group: 'Orders' },
  { key: 'orders.update', label: 'Update orders', hint: 'Change order status, cancel and refund', group: 'Orders' },
  { key: 'products.create', label: 'Create products', hint: 'Add new products and upload photos', group: 'Products' },
  { key: 'products.edit', label: 'Edit products', hint: 'Change prices, stock, photos, publish/unpublish', group: 'Products' },
  { key: 'products.delete', label: 'Delete products', hint: 'Permanently remove products', group: 'Products' },
  { key: 'categories.manage', label: 'Manage categories', hint: 'Create, edit, reorder and delete', group: 'Products' },
  { key: 'questions.answer', label: 'Answer questions', hint: 'Reply to customer product questions', group: 'Products' },
  { key: 'customers.view', label: 'View customers', hint: 'Customer accounts, contact details and history', group: 'Customers' },
  { key: 'customers.suspend', label: 'Suspend customers', hint: 'Suspend or reactivate customer accounts', group: 'Customers' },
  { key: 'discounts.manage', label: 'Manage discounts', hint: 'Create and edit their own discount codes; see all codes', group: 'Marketing' },
  { key: 'shipping.manage', label: 'Manage shipping', hint: 'Cargo rates and free-shipping rules', group: 'Settings' },
] as const;

export type Permission = (typeof PERMISSIONS)[number]['key'];
export type StaffRole = 'customer' | 'admin' | 'super_admin';

export const ROLE_LABEL: Record<StaffRole, string> = { customer: 'Customer', admin: 'Admin', super_admin: 'Super admin' };

type Who = { role: string; status: string; permissions?: string[] | null } | null | undefined;

export const isStaff = (p: Who) => !!p && p.status === 'active' && (p.role === 'admin' || p.role === 'super_admin');
export const isSuperAdmin = (p: Who) => !!p && p.status === 'active' && p.role === 'super_admin';

/** Super admins can do everything; admins only what they were granted. */
export function can(p: Who, permission: Permission) {
  if (!isStaff(p)) return false;
  return p!.role === 'super_admin' || (p!.permissions ?? []).includes(permission);
}

export const canAny = (p: Who, ...permissions: Permission[]) => permissions.some((x) => can(p, x));
