-- ============================================================================
-- MIGRAÇÃO 008: AJUSTE DE CONSTRAINTS DE STATUS PARA COLUNAS E ENTENDA O ASSUNTO
-- Permite soft-delete ('excluido'), 'arquivado', e alinha status editoriais ('aprovado', 'rejeitado')
-- ============================================================================

-- 1. ai_colunas_editoriais: status e review_status
ALTER TABLE ai_colunas_editoriais DROP CONSTRAINT IF EXISTS ai_colunas_editoriais_status_check;
ALTER TABLE ai_colunas_editoriais ADD CONSTRAINT ai_colunas_editoriais_status_check
    CHECK (status IN ('rascunho_auditado', 'aguardando_revisao', 'aprovado', 'publicado', 'rejeitado', 'excluido', 'arquivado'));

ALTER TABLE ai_colunas_editoriais DROP CONSTRAINT IF EXISTS ai_colunas_editoriais_review_status_check;
ALTER TABLE ai_colunas_editoriais ADD CONSTRAINT ai_colunas_editoriais_review_status_check
    CHECK (review_status IN ('rascunho_auditado', 'aguardando_revisao', 'aprovado', 'publicado', 'rejeitado', 'excluido', 'arquivado'));

-- 2. ai_entenda_o_assunto: status
ALTER TABLE ai_entenda_o_assunto DROP CONSTRAINT IF EXISTS ai_entenda_o_assunto_status_check;
ALTER TABLE ai_entenda_o_assunto ADD CONSTRAINT ai_entenda_o_assunto_status_check
    CHECK (status IN ('rascunho_auditado', 'aguardando_revisao', 'ativo', 'aprovado', 'publicado', 'rejeitado', 'excluido', 'arquivado'));
