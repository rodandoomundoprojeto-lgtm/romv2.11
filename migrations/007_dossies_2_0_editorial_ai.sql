-- ============================================================================
-- Migração 007 — Dossiês 2.0: camada editorial analítica (IA + revisão)
-- Adiciona workflow editorial (draft/review/published), síntese executiva,
-- linha do tempo e metadados de geração por IA. Idempotente.
-- ============================================================================

BEGIN;

ALTER TABLE dossies
    ADD COLUMN IF NOT EXISTS workflow_status TEXT NOT NULL DEFAULT 'published',
    ADD COLUMN IF NOT EXISTS executive_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS timeline JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS ai_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'dossies_workflow_status_check'
    ) THEN
        ALTER TABLE dossies
            ADD CONSTRAINT dossies_workflow_status_check
            CHECK (workflow_status IN ('draft', 'review', 'published'));
    END IF;
END $$;

-- Recria a view para expor os novos campos preservando o cálculo de status temporal.
-- (DROP necessário: CREATE OR REPLACE não permite alterar ordem/nomes de colunas existentes)
DROP VIEW IF EXISTS view_dossies_com_status;
CREATE VIEW view_dossies_com_status AS
SELECT
    d.id, d.slug, d.titulo, d.subtitulo, d.tipo, d.categoria, d.icone_ou_bandeira,
    d.data_inicio, d.data_fim, d.regras_classificacao, d.meta_info, d.rota, d.ordem,
    d.ultima_atualizacao,
    d.workflow_status,
    d.executive_summary,
    d.timeline,
    d.ai_metadata,
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
