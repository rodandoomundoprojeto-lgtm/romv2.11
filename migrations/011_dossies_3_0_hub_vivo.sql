-- ============================================================================
-- Migração 011 — Dossiê 3.0: Hub Vivo de Inteligência Jornalística
-- Adiciona camada editorial profunda (editorial_briefing), ângulos de
-- cobertura (coverage_angles), relatório de auditoria/isenção (audit_report)
-- e fila de pulso incremental (pending_update). Idempotente.
-- ============================================================================

BEGIN;

ALTER TABLE dossies
    ADD COLUMN IF NOT EXISTS editorial_briefing JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS coverage_angles JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS audit_report JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS pending_update JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Recria a view para expor todos os campos 3.0 preservando status temporal e veiculos_count.
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
    d.editorial_briefing,
    d.coverage_angles,
    d.audit_report,
    d.pending_update,
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
