# Trendora storefront

Run `npm start`, then open http://127.0.0.1:4390. No frontend installation or build is required. Run `npm run check` for syntax validation and `npm test` for commerce regression tests.

## Structure

- `css/storefront.css`: shared customer and administration design system.
- `js/main.js`: shared navigation, account dialogs, footer and admin workspace.
- `js/store.js`: live catalog, search, categories, product cards and storefront pagination.
- `js/admin-products.js`: catalog editor, uploads, inventory search, stock filters and pagination.
- `js/commerce.mjs`: reusable cart, inventory and discount validation.
- `js/checkout-order.js`: atomic inventory reservation, coupon use and order creation.
- `js/order-transactions.js`: atomic status changes, cancellation and inventory restoration.
- `js/order-feed.mjs`: canonical Firestore identity and deduplication of existing order mirrors.
- `terms.html`, `privacy.html`, `returns.html`: customer-facing store policies linked from every storefront footer.

The Firebase project, existing collections, Cloudinary account, email endpoint and stored order namespaces are retained. Customer and admin order documents remain mirrored records of one order. Status changes use update operations on existing documents; they never create a new order. Feed subscriptions are disposed before refresh or account changes; rendering is derived only from current snapshots.

Only actual product images are used. Products marked Featured in the admin form can supply homepage imagery; otherwise the homepage uses typography. Missing images show an explicit unavailable state.

## Verification and deployment notes

23 regression tests cover invalid input, stock and coupon contention, mirrored status changes, duplicate display prevention, stale snapshot removal and single inventory restoration. These tests use an in-memory transaction adapter and do not mutate the production database. Browser checks covered real catalog reads, search/reset, product details, mobile layouts and authentication gating. Authenticated admin writes and a real payment have not been verified in this session.

The existing Razorpay integration uses a test key and client-side payment callbacks. Production use still requires server-side payment verification/webhooks and a review of deployed Firestore rules. No Firestore rule changes, data migration, live payments or production record deletion were performed. The historical `REPLACE_WITH_ADMIN_UID` order namespace is intentionally retained for compatibility with existing records; it is not a new Firebase connection.

## Email endpoint protection

The Express backend and Supabase email function validate supported message types and recipient email shape, and allow at most 8 email requests per client IP over 15 minutes. The in-process / edge-isolate limit is an application-level safeguard; deployments running multiple backend instances should also enforce an equivalent shared rate limit at the CDN, gateway, or Redis layer.
