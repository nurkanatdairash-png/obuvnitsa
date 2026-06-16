-- ═══════════════════════════════════════════════════════
-- EMERGENCY LOCKDOWN — run this immediately in the Supabase SQL Editor
-- Closes the public DELETE hole that let anyone on the internet wipe
-- products/sales without logging in. Safe to re-run.
-- ═══════════════════════════════════════════════════════

-- Remove the wide-open anon DELETE policies (USING (true) = anyone, no auth needed)
DROP POLICY IF EXISTS "anon_products_delete" ON public.products;
DROP POLICY IF EXISTS "anon_sales_delete"    ON public.sales;

-- Revoke the DELETE grant itself (belt + suspenders — policy alone isn't
-- enough if the grant is still there)
REVOKE DELETE ON public.products FROM anon;
REVOKE DELETE ON public.sales    FROM anon;

-- NOTE: this disables the in-app "delete product" / "delete sale" /
-- "Удалить все продажи" buttons for everyone (owner included), because
-- the app currently has no way to prove "owner" to the database — both
-- roles connect as the same anon key. That's the real fix needed next
-- (see migration note below). Until then, this trade-off is correct:
-- losing the delete button beats leaving the DB open to the public.
