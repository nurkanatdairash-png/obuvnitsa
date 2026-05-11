-- ═══════════════════════════════════════════════════════
-- ОБУВНИЦА PRO — Supabase Database Setup
-- Safe to re-run: all statements use IF NOT EXISTS / DROP IF EXISTS / ON CONFLICT DO NOTHING
-- ═══════════════════════════════════════════════════════
--
-- ⚠️  ВАЖНО: Отключи подтверждение email, иначе новые продавщицы
--            не смогут войти после регистрации.
--
--    Supabase Dashboard →  Authentication  →  Providers
--    → Email  →  выключи "Confirm email"  →  Save
--
-- ═══════════════════════════════════════════════════════


-- ── 1. PROFILES TABLE ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id         uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name  text,
  role       text        NOT NULL DEFAULT 'seller' CHECK (role IN ('owner', 'seller')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select"
  ON public.profiles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
CREATE POLICY "profiles_insert"
  ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

-- Only the user themselves can update their own profile
DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
CREATE POLICY "profiles_update"
  ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());


-- ── 2. HELPER FUNCTION: is the current user an owner? ───
-- Used inside RLS policies so we don't repeat the subquery everywhere
CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'owner'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;


-- ── 3. AUTO-CREATE PROFILE ON SIGNUP ────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'role', 'seller')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ── 4. PRODUCTS TABLE ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.products (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  row_id      text,
  code        text,
  name        text        NOT NULL,
  brand       text,
  type        text,
  color       text,
  material    text,
  season      text,
  audience    text,
  buy_price   numeric     NOT NULL DEFAULT 0,
  sell_price  numeric     NOT NULL DEFAULT 0,
  supplier    text,
  notes       text,
  size        numeric     NOT NULL,
  qty         numeric     NOT NULL DEFAULT 0,
  series      text,
  arrive_date date,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Everyone can read stock
DROP POLICY IF EXISTS "products_select" ON public.products;
CREATE POLICY "products_select"
  ON public.products FOR SELECT TO authenticated USING (true);

-- Everyone can add new stock arrivals
DROP POLICY IF EXISTS "products_insert" ON public.products;
CREATE POLICY "products_insert"
  ON public.products FOR INSERT TO authenticated WITH CHECK (true);

-- Only the owner can edit or delete stock
DROP POLICY IF EXISTS "products_update" ON public.products;
CREATE POLICY "products_update"
  ON public.products FOR UPDATE TO authenticated USING (public.is_owner());

DROP POLICY IF EXISTS "products_delete" ON public.products;
CREATE POLICY "products_delete"
  ON public.products FOR DELETE TO authenticated USING (public.is_owner());


-- ── 5. SALES TABLE ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sales (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id     uuid        REFERENCES public.products(id) ON DELETE SET NULL,
  product_row_id text,
  name           text        NOT NULL,
  size           numeric,
  color          text,
  qty            numeric     NOT NULL DEFAULT 1,
  price          numeric     NOT NULL DEFAULT 0,
  buy_price      numeric     NOT NULL DEFAULT 0,
  discount       numeric     NOT NULL DEFAULT 0,
  total          numeric     NOT NULL DEFAULT 0,
  profit         numeric     NOT NULL DEFAULT 0,
  payment        text        NOT NULL DEFAULT 'Наличные',
  customer       text,
  note           text,
  sale_date      date,
  sale_time      text,
  seller_id      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  seller_name    text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

-- Everyone can read and record sales
DROP POLICY IF EXISTS "sales_select" ON public.sales;
CREATE POLICY "sales_select"
  ON public.sales FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "sales_insert" ON public.sales;
CREATE POLICY "sales_insert"
  ON public.sales FOR INSERT TO authenticated WITH CHECK (true);

-- Only the owner can delete sales records
DROP POLICY IF EXISTS "sales_delete" ON public.sales;
CREATE POLICY "sales_delete"
  ON public.sales FOR DELETE TO authenticated USING (public.is_owner());


-- ── 6. PERFORMANCE INDEXES ───────────────────────────────
CREATE INDEX IF NOT EXISTS idx_products_created_at     ON public.products(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_arrive_date    ON public.products(arrive_date);
CREATE INDEX IF NOT EXISTS idx_products_name           ON public.products(name);
CREATE INDEX IF NOT EXISTS idx_sales_created_at        ON public.sales(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_sale_date         ON public.sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_sales_product_row_id    ON public.sales(product_row_id);
CREATE INDEX IF NOT EXISTS idx_sales_seller_id         ON public.sales(seller_id);


-- ── 7. REALTIME ───────────────────────────────────────────
-- Without this, live updates between devices don't work.
-- Wrapped in DO blocks so it's safe to re-run even if already enabled.
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.sales;
EXCEPTION WHEN others THEN NULL; END $$;


-- ── 8. GRANTS ─────────────────────────────────────────────
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON public.profiles TO authenticated;
GRANT ALL ON public.products TO authenticated;
GRANT ALL ON public.sales    TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_owner() TO authenticated;


-- ── 9. BACKFILL PROFILES ──────────────────────────────────
-- Creates missing profiles for users who registered before the trigger existed
INSERT INTO public.profiles (id, full_name, role)
SELECT
  id,
  COALESCE(raw_user_meta_data->>'full_name', email),
  COALESCE(raw_user_meta_data->>'role', 'seller')
FROM auth.users
ON CONFLICT (id) DO NOTHING;
