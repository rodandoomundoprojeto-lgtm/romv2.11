-- Radar de Content Gaps: temas quentes da IA x estoque de artigos do site
-- GAP_CRITICO = 0 artigos e score >= 80 | GAP_OPORTUNIDADE = <=1 artigo e score >= 65
WITH cobertura_atual AS (
    SELECT
        i.id AS insight_id, i.slug, i.titulo_tema, i.categoria_primaria,
        i.relevancia_score, i.palavras_chave_busca, i.sugestao_pauta_gap, i.expires_at,
        COUNT(DISTINCT c.id) AS total_artigos_no_site,
        COALESCE(ARRAY_AGG(DISTINCT c.id) FILTER (WHERE c.id IS NOT NULL), '{}') AS ids_artigos_existentes
    FROM ai_curadoria_insights i
    LEFT JOIN conteudos c
        ON (
            c.tags && i.palavras_chave_busca
            OR c.busca_vetor @@ plainto_tsquery('portuguese', i.titulo_tema)
            OR (
                SELECT COUNT(DISTINCT tk)
                FROM unnest(regexp_split_to_array(lower(array_to_string(i.palavras_chave_busca, ' ')), '\s+')) AS tk
                WHERE length(tk) >= 4 AND tk = ANY(c.tags)
            ) >= 3
        )
    WHERE i.expires_at > NOW()
    GROUP BY i.id
)
SELECT
    slug, titulo_tema, categoria_primaria, relevancia_score, total_artigos_no_site,
    CASE
        WHEN total_artigos_no_site = 0 AND relevancia_score >= 80 THEN 'GAP_CRITICO'
        WHEN total_artigos_no_site <= 1 AND relevancia_score >= 65 THEN 'GAP_OPORTUNIDADE'
        ELSE 'COBERTO'
    END AS status_cobertura,
    CASE WHEN total_artigos_no_site <= 1 THEN sugestao_pauta_gap ELSE NULL END AS pauta_para_escrever,
    ids_artigos_existentes,
    expires_at
FROM cobertura_atual
ORDER BY (relevancia_score::float / (total_artigos_no_site + 1)) DESC;

