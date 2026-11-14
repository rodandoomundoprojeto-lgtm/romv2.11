-- ============================================================================
-- Migração 004 — Fase 3: elegibilidade ao_vivo + recálculo atômico de veículos únicos
-- Idempotente. Aplicar: python scripts/seed_dossies.py --migrate (ou psql -f)
-- ============================================================================

BEGIN;

-- 1) Idempotência: garante UNIQUE (dossie_id, materia_url) mesmo em bases antigas.
--    (A 003 já cria; aqui só reforçamos caso a tabela tenha vindo de outro caminho.)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'dossie_materias'::regclass AND contype = 'u'
          AND pg_get_constraintdef(oid) ILIKE '%(dossie_id, materia_url)%'
    ) THEN
        -- remove duplicatas pré-existentes (mantém a mais antiga) antes de criar a constraint
        DELETE FROM dossie_materias a USING dossie_materias b
         WHERE a.dossie_id = b.dossie_id AND a.materia_url = b.materia_url AND a.id > b.id;
        ALTER TABLE dossie_materias
            ADD CONSTRAINT dossie_materias_dossie_url_uniq UNIQUE (dossie_id, materia_url);
    END IF;
END $$;

-- 2) Dossiês elegíveis para o classificador: SOMENTE status ao_vivo no instante da consulta.
--    Permanentes são "sempre ao vivo" (nunca em_breve/arquivo); especiais dependem da janela de datas.
CREATE OR REPLACE FUNCTION dossies_elegiveis_ingestao(p_agora TIMESTAMPTZ DEFAULT NOW())
RETURNS TABLE (id INTEGER, slug VARCHAR, tipo VARCHAR, regras_classificacao JSONB)
LANGUAGE sql STABLE AS $$
    SELECT d.id, d.slug, d.tipo, d.regras_classificacao
      FROM dossies d
     WHERE d.tipo = 'permanente'
        OR (d.tipo = 'especial'
            AND p_agora >= d.data_inicio
            AND (d.data_fim IS NULL OR p_agora <= d.data_fim));
$$;

-- 3) Recálculo atômico de veiculos_unicos_count.
--    pg_advisory_xact_lock(dossie_id) serializa transações concorrentes no MESMO dossiê:
--    a segunda só conta depois que a primeira comitou, então nunca grava contagem obsoleta.
CREATE OR REPLACE FUNCTION fn_recalcular_veiculos_unicos() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_ids INTEGER[];
    v_id  INTEGER;
BEGIN
    IF TG_OP = 'INSERT' THEN v_ids := ARRAY[NEW.dossie_id];
    ELSIF TG_OP = 'DELETE' THEN v_ids := ARRAY[OLD.dossie_id];
    ELSE v_ids := ARRAY(SELECT DISTINCT x FROM unnest(ARRAY[OLD.dossie_id, NEW.dossie_id]) x);
    END IF;

    -- ordem ascendente de lock evita deadlock quando há UPDATE movendo entre dossiês
    FOR v_id IN SELECT x FROM unnest(v_ids) x ORDER BY x LOOP
        PERFORM pg_advisory_xact_lock(hashtextextended('dossie_veiculos:' || v_id, 0));
        UPDATE dossies d
           SET veiculos_unicos_count = (
                   SELECT COUNT(DISTINCT lower(btrim(m.veiculo_nome)))
                     FROM dossie_materias m WHERE m.dossie_id = v_id),
               ultima_atualizacao = NOW()
         WHERE d.id = v_id;
    END LOOP;
    RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_dossie_materias_veiculos ON dossie_materias;
CREATE TRIGGER trg_dossie_materias_veiculos
AFTER INSERT OR DELETE OR UPDATE OF veiculo_nome, dossie_id ON dossie_materias
FOR EACH ROW EXECUTE FUNCTION fn_recalcular_veiculos_unicos();

-- 4) Backfill (corrige contagens já gravadas).
UPDATE dossies d SET veiculos_unicos_count = COALESCE((
    SELECT COUNT(DISTINCT lower(btrim(m.veiculo_nome))) FROM dossie_materias m WHERE m.dossie_id = d.id), 0);

COMMIT;
