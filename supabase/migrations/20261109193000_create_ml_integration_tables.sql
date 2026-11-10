-- ============================================================================
-- INTEGRAÇÃO OFICIAL MERCADO LIVRE (ESTOQUE, VARIAÇÕES, SKUS E VENDAS)
-- Execute este script no SQL Editor do Supabase do projeto AM3D
-- ============================================================================

-- 1. Tabela de Tokens OAuth dos Marketplaces
CREATE TABLE IF NOT EXISTS public.marketplace_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid DEFAULT 'a0d8e8fc-66de-4e31-8c4d-eb4044c3c3a9'::uuid,
  platform text NOT NULL DEFAULT 'ml',
  access_token text NOT NULL,
  refresh_token text,
  ml_user_id text,
  ml_nickname text,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (empresa_id, platform)
);

-- 2. Tabela de Anúncios Sincronizados (com suporte a Variações, SKU e vínculo com FT)
CREATE TABLE IF NOT EXISTS public.marketplace_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid DEFAULT 'a0d8e8fc-66de-4e31-8c4d-eb4044c3c3a9'::uuid,
  platform text NOT NULL DEFAULT 'ml',
  ml_item_id text NOT NULL UNIQUE,
  title text,
  sku text,
  thumbnail_url text,
  permalink text,
  status text,
  price numeric,
  price_promo numeric,
  stock_ml integer DEFAULT 0,
  stock_physical integer DEFAULT 0,
  logistic_type text,
  variations jsonb DEFAULT '[]'::jsonb,
  ft_id text,
  updated_at timestamptz DEFAULT now()
);

-- 3. Habilitar RLS e Políticas de Acesso
ALTER TABLE public.marketplace_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_listings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acesso marketplace_tokens autenticados" ON public.marketplace_tokens;
CREATE POLICY "Acesso marketplace_tokens autenticados"
  ON public.marketplace_tokens
  FOR ALL
  TO authenticated, anon
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Acesso marketplace_listings autenticados" ON public.marketplace_listings;
CREATE POLICY "Acesso marketplace_listings autenticados"
  ON public.marketplace_listings
  FOR ALL
  TO authenticated, anon
  USING (true)
  WITH CHECK (true);
