-- ============================================================================
-- Migração 004 — Estado de execução do pipeline em PostgreSQL (Nível 2B)
-- Mesmo conteúdo de migrations/006_pipeline_state.sql (idempotente).
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
