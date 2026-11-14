-- Migração 001 — Agente de Curadoria IA (Rodando o Mundo)
-- Aplicar: psql "$CURADORIA_DATABASE_URL" -f curadoria/db/migrations/001_init.sql

BEGIN;

-- 1. Insights gerados pela IA
CREATE TABLE IF NOT EXISTS ai_curadoria_insights (
    id SERIAL PRIMARY KEY,
    slug VARCHAR(180) UNIQUE NOT NULL,
    batch_id VARCHAR(50) NOT NULL,
    titulo_tema VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('novo', 'em_alta', 'atualizacao')),
    categoria_primaria VARCHAR(50) NOT NULL,
    categorias_cruzadas TEXT[] DEFAULT '{}',
    relevancia_score INTEGER NOT NULL CHECK (relevancia_score >= 0 AND relevancia_score <= 100),
    ttl_horas INTEGER NOT NULL,
    palavras_chave_busca TEXT[] NOT NULL,
    gatilho_vitrine TEXT NOT NULL,
    sintese_nerd TEXT NOT NULL,
    sugestao_pauta_gap JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_insights_ativos_score ON ai_curadoria_insights (expires_at, relevancia_score DESC);
CREATE INDEX IF NOT EXISTS idx_insights_palavras_chave ON ai_curadoria_insights USING GIN (palavras_chave_busca);
CREATE INDEX IF NOT EXISTS idx_insights_categorias ON ai_curadoria_insights (categoria_primaria);
CREATE INDEX IF NOT EXISTS idx_insights_updated ON ai_curadoria_insights (updated_at DESC);

-- 2. Conteúdos do site com Full-Text Search nativo
CREATE TABLE IF NOT EXISTS conteudos (
    id SERIAL PRIMARY KEY,
    titulo VARCHAR(255) NOT NULL,
    resumo TEXT NOT NULL,
    corpo TEXT NOT NULL,
    categoria VARCHAR(50) NOT NULL,
    tags TEXT[] DEFAULT '{}',
    publicado_em TIMESTAMPTZ DEFAULT NOW(),
    busca_vetor TSVECTOR GENERATED ALWAYS AS (
        setweight(to_tsvector('portuguese', coalesce(titulo, '')), 'A') ||
        setweight(to_tsvector('portuguese', coalesce(resumo, '')), 'B') ||
        setweight(to_tsvector('portuguese', coalesce(corpo, '')), 'C')
    ) STORED
);

CREATE INDEX IF NOT EXISTS idx_conteudos_busca_vetor ON conteudos USING GIN (busca_vetor);
CREATE INDEX IF NOT EXISTS idx_conteudos_tags ON conteudos USING GIN (tags);

COMMIT;

