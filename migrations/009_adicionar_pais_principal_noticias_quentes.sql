-- ============================================================================
-- MIGRAÇÃO 009: ADICIONAR COLUNA pais_principal EM ai_noticias_quentes
-- Permite fixar ou rotacionar o país principal no ticker de notícias quentes
-- ============================================================================

ALTER TABLE ai_noticias_quentes ADD COLUMN IF NOT EXISTS pais_principal VARCHAR(2);
CREATE INDEX IF NOT EXISTS idx_ai_noticias_quentes_pais_principal ON ai_noticias_quentes(pais_principal);
