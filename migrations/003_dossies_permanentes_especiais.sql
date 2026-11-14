-- ============================================================================
-- Migração 003 — Dossiês Permanentes e Especiais (status dinâmico)
-- Idempotente. Aplicar: python scripts/seed_dossies.py --migrate --seed
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS dossies (
    id SERIAL PRIMARY KEY,
    slug VARCHAR(120) UNIQUE NOT NULL,
    titulo VARCHAR(255) NOT NULL,
    subtitulo TEXT NOT NULL,
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('permanente', 'especial')),
    categoria VARCHAR(50) NOT NULL,
    icone_ou_bandeira VARCHAR(50) NOT NULL,
    data_inicio TIMESTAMPTZ,
    data_fim TIMESTAMPTZ,
    regras_classificacao JSONB NOT NULL DEFAULT '{"palavras_chave": [], "paises": []}'::jsonb,
    meta_info VARCHAR(120),
    rota VARCHAR(160),                       -- rota interna existente (Regra 11); NULL = sem página ainda
    veiculos_unicos_count INTEGER NOT NULL DEFAULT 0,
    ordem INTEGER NOT NULL DEFAULT 0,
    ultima_atualizacao TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT dossies_especial_tem_datas CHECK (tipo <> 'especial' OR data_inicio IS NOT NULL),
    CONSTRAINT dossies_periodo_valido CHECK (data_fim IS NULL OR data_inicio IS NULL OR data_fim >= data_inicio)
);

CREATE INDEX IF NOT EXISTS idx_dossies_tipo_datas ON dossies (tipo, data_inicio, data_fim);
CREATE INDEX IF NOT EXISTS idx_dossies_categoria ON dossies (categoria);

CREATE TABLE IF NOT EXISTS dossie_materias (
    id SERIAL PRIMARY KEY,
    dossie_id INTEGER NOT NULL REFERENCES dossies(id) ON DELETE CASCADE,
    materia_titulo TEXT NOT NULL,
    materia_url TEXT NOT NULL,
    veiculo_nome VARCHAR(150) NOT NULL,
    pais_veiculo CHAR(2),
    vies VARCHAR(20),
    publicado_em TIMESTAMPTZ DEFAULT NOW(),
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (dossie_id, materia_url)
);

CREATE INDEX IF NOT EXISTS idx_dossie_materias_dossie ON dossie_materias (dossie_id, publicado_em DESC);

-- View com status dinâmico calculado em tempo de consulta (fuso: instante absoluto NOW()).
CREATE OR REPLACE VIEW view_dossies_com_status AS
SELECT
    d.id, d.slug, d.titulo, d.subtitulo, d.tipo, d.categoria, d.icone_ou_bandeira,
    d.data_inicio, d.data_fim, d.regras_classificacao, d.meta_info, d.rota, d.ordem,
    d.ultima_atualizacao,
    CASE
        WHEN d.tipo = 'permanente' THEN 'permanente'
        WHEN NOW() < d.data_inicio THEN 'em_breve'
        WHEN d.data_fim IS NOT NULL AND NOW() > d.data_fim THEN 'arquivo'
        ELSE 'ao_vivo'
    END AS status,
    GREATEST(
        d.veiculos_unicos_count,
        COALESCE((SELECT COUNT(DISTINCT m.veiculo_nome) FROM dossie_materias m WHERE m.dossie_id = d.id), 0)
    )::int AS veiculos_count
FROM dossies d;

COMMIT;
