# Herufi Admin — mobile app

React Native (Expo SDK 57 + expo-router) app for running the Herufi store from a phone. It has the same functionality as the website's `/admin` panel and talks to the same Supabase database.

## What it does
| Area | Features |
| --- | --- |
| **Overview** | Revenue, orders, average order value, customers, products, repeat rate and cart-to-order rate, each with change vs the previous period. Includes a daily revenue chart, orders by status (tap to filter), recent orders, top products and low stock. Switch between 7, 30 and 90 days. |
| **Orders** | Search by number or email, filter by status, infinite scroll. The detail view has a status changer (cancel asks for confirmation and marks the payment refunded), a timeline, items and totals, address, delivery and payment, plus one-tap email, call and WhatsApp to the customer. |
| **Products** | Search by name, brand or SKU, and filter by active, draft, low stock or on sale. Quick actions: publish or unpublish, adjust stock, view in store. The full editor covers images (photo library, camera or URL; reorder; alt text; cover), details, highlights, specifications, status, category, brand, pricing with a discount preview, SKU and stock, variants, shipping weight and box size with a live volumetric readout, allowed cargo methods, answering customer questions, and delete. |
| **Customers** | Search; lifetime orders and spend; detail with order history and profile; suspend or reactivate (not your own account). |
| **Categories** | Reorder, create, edit (cover image upload) and delete. |
| **Discounts** | Percentage or fixed coupons with minimum spend, usage limit, expiry (with presets) and active toggle. |
| **Shipping rates** | Air cargo, express air and sea freight: rates, minimum charge, volumetric divisor, delivery days, and the free sea-shipping rules. |
| **Questions** | An inbox of unanswered product questions across the catalog. |
| **More** | Light, dark or system theme; open the store; sign out. |

## Security model
- The app holds only the **public anon key**. Never put the service-role key in it: every `EXPO_PUBLIC_*` value ships inside the app.
- Power comes from the signed-in account's role and permissions, enforced by the database on every read and write: Row Level Security with `public.has_permission(...)`, column grants, storage policies and the `admin_*` functions. The app only uses them to decide which tabs and buttons to show. A customer who signs in sees "Not an admin account", and the database would refuse their requests anyway.

## Roles and permissions
| Role | Can do |
| --- | --- |
| **Super admin** | Everything, plus **Staff** (More → Staff): add admins or other super admins by email, choose each admin's permissions, and remove staff access. Super admins can't change their own role, so there's always someone left in charge. |
| **Admin** | Only what a super admin grants: view dashboard, view orders, update orders, create products, edit products, delete products, manage categories, answer questions, view customers, suspend customers, manage discounts, manage shipping. Tabs and buttons for anything else are hidden, and screens opened from a link show "No access". |

**Discount codes belong to a staff member.** Each code (e.g. `SAV105`) is assigned to an admin; super admins pick the owner, other admins' codes are always their own. Every admin sees their codes' orders, revenue and discount given (Home and Discounts → View orders) even without other permissions. Super admins and discount managers also see sales by staff.

People must sign up on the store first; a super admin then adds them by email. Removing someone from staff keeps their account, so they become a customer, and their codes keep their history.

### Database setup
Run the migrations from the website repo in the Supabase SQL editor, **as two separate runs**:
1. `supabase/migrations/0008_super_admin_role.sql`
2. `supabase/migrations/0009_staff_permissions.sql`. Existing admins become super admins, so nobody loses access.

To create the very first super admin by hand:
```sql
update public.profiles set role = 'super_admin' where email = 'you@example.com';
```

## Setup
```bash
npm install
cp .env.example .env    # same Supabase URL + anon key as the website, and the site URL
npx expo start
```
`.env`:
- `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`: from Supabase → Settings → API.
- `EXPO_PUBLIC_SITE_URL`: the live storefront, for example `https://herufi.co.tz`. It's used for "View in store" links and to refresh the store's cache after edits.

### Storefront refresh
After any catalog change, the app calls `POST {SITE_URL}/api/admin/revalidate` with the admin's access token. That route lives in the website repo (`src/app/api/admin/revalidate/route.ts`); it checks that the token belongs to an active admin, then clears the catalog cache. Edits appear on the website right away. If the call fails, they still appear within the cache's 5-minute window.

## Running and building
- `npm run android` / `npm run ios` / `npm run web`
- `npm run typecheck` / `npm run lint`
- Uses native modules (expo-image-picker with the camera, expo-sqlite, reanimated). If Expo Go doesn't support SDK 57 yet, use a development build: `npx expo run:android`.
- Release builds with EAS: `eas build -p android` (package `tz.co.herufi.admin`) or `-p ios` (bundle `tz.co.herufi.admin`). It installs alongside the shopper app (`tz.co.herufi.app`).
- Distribute it privately (internal testing track, TestFlight, or a direct APK). It's a staff tool, not a store listing.
