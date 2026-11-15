-- ============================================================================
-- Migração 006 — Estado de execução do pipeline em PostgreSQL (Nível 2B)
-- Idempotente. Aplicar via psql -f migrations/006_pipeline_state.sql
--
-- Substitui os arquivos data/vitrine_ia.json, data/feed_output.json e
-- data/history.json como fonte de verdade. Os arquivos seguem como espelho e
-- fallback durante a migração.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS ai_pipeline_state (
    chave      TEXT PRIMARY KEY,
    payload    JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE ai_pipeline_state IS
    'Estado JSON dos artefatos gerados pelo pipeline (vitrine_ia, feed_output, history).';
COMMENT ON COLUMN ai_pipeline_state.chave IS
    'Identificador do estado: vitrine_ia | feed_output | history.';

CREATE INDEX IF NOT EXISTS idx_ai_pipeline_state_updated_at
    ON ai_pipeline_state (updated_at DESC);

COMMIT;
