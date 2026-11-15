-- ============================================================================
-- Migração 005 — Parte 1 (ATLAS-VIVO): Cache Vivo por País, Pulso Continental e Tradução
-- Contrato: .agents/contracts/ATLAS-VIVO.md
-- Idempotente. Aplicar via psql -f migrations/005_atlas_vivo_cache_e_pulso.sql
-- ============================================================================

BEGIN;

-- 1) Cache vivo de notícias por país/território (On-Demand + Tradução Persistida)
CREATE TABLE IF NOT EXISTS atlas_pais_noticias (
    country_code  VARCHAR(8) PRIMARY KEY,
    country_name  VARCHAR(120) NOT NULL DEFAULT '',
    continent_key VARCHAR(32) NOT NULL DEFAULT '',
    items_json    JSONB NOT NULL DEFAULT '[]'::jsonb,
    source_mode   VARCHAR(32) NOT NULL DEFAULT 'hybrid_rss',
    item_count    INTEGER NOT NULL DEFAULT 0,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at    TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '15 minutes')
);

CREATE INDEX IF NOT EXISTS idx_atlas_pais_noticias_updated_at
    ON atlas_pais_noticias (updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_atlas_pais_noticias_continent
    ON atlas_pais_noticias (continent_key, updated_at DESC);

-- 2) Pulso agregado por continente (alimentado pelo Cron Trigger na borda)
CREATE TABLE IF NOT EXISTS atlas_pulso_continental (
    continent_key    VARCHAR(32) PRIMARY KEY,
    headlines_json   JSONB NOT NULL DEFAULT '[]'::jsonb,
    active_countries JSONB NOT NULL DEFAULT '[]'::jsonb,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3) Cache de traduções em lote para evitar re-tradução de manchetes repetidas
CREATE TABLE IF NOT EXISTS atlas_traducao_cache (
    hash_key        VARCHAR(64) PRIMARY KEY,
    target_lang     VARCHAR(10) NOT NULL DEFAULT 'pt',
    original_text   TEXT NOT NULL,
    translated_text TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_atlas_traducao_cache_created_at
    ON atlas_traducao_cache (created_at DESC);

-- 4) Função auxiliar para consultar países com pulso recente sem limitar a catálogo fixo
CREATE OR REPLACE FUNCTION atlas_paises_ativos(
    p_janela INTERVAL DEFAULT INTERVAL '6 hours',
    p_limite INTEGER DEFAULT 60
)
RETURNS TABLE (
    country_code  VARCHAR,
    country_name  VARCHAR,
    continent_key VARCHAR,
    items_json    JSONB,
    source_mode   VARCHAR,
    item_count    INTEGER,
    updated_at    TIMESTAMPTZ
)
LANGUAGE sql STABLE AS $$
    SELECT
        p.country_code,
        p.country_name,
        p.continent_key,
        p.items_json,
        p.source_mode,
        p.item_count,
        p.updated_at
    FROM atlas_pais_noticias p
    WHERE p.item_count > 0
      AND p.updated_at >= (NOW() - p_janela)
    ORDER BY p.updated_at DESC
    LIMIT p_limite;
$$;

COMMIT;
