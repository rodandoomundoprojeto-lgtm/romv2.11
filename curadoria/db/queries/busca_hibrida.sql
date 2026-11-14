-- Busca Híbrida: relevância textual + boost de tendência da IA
-- Parâmetro: :termo_usuario
WITH insights_relevantes AS (
    SELECT relevancia_score, palavras_chave_busca, categoria_primaria
    FROM ai_curadoria_insights
    WHERE expires_at > NOW()
      AND (
          lower(:termo_usuario) = ANY(palavras_chave_busca)
          OR titulo_tema ILIKE '%' || :termo_usuario || '%'
          OR sintese_nerd ILIKE '%' || :termo_usuario || '%'
      )
    ORDER BY relevancia_score DESC
    LIMIT 3
),
termos_expandidos AS (
    SELECT
        COALESCE(MAX(relevancia_score), 0) AS max_score_ia,
        ARRAY(
            SELECT DISTINCT unnest(
                palavras_chave_busca || regexp_split_to_array(lower(array_to_string(palavras_chave_busca, ' ')), '\s+')
            )
            FROM insights_relevantes
        ) AS lista_keywords_ia
    FROM insights_relevantes
)
SELECT
    c.id, c.titulo, c.resumo, c.categoria, c.tags,
    ts_rank(c.busca_vetor, websearch_to_tsquery('portuguese', :termo_usuario)) AS score_texto,
    CASE WHEN c.tags && te.lista_keywords_ia THEN (te.max_score_ia / 100.0) * 0.5 ELSE 0 END AS bonus_tendencia_ia,
    (
        ts_rank(c.busca_vetor, websearch_to_tsquery('portuguese', :termo_usuario)) +
        CASE WHEN c.tags && te.lista_keywords_ia THEN (te.max_score_ia / 100.0) * 0.5 ELSE 0 END
    ) AS score_final
FROM conteudos c
CROSS JOIN termos_expandidos te
WHERE c.busca_vetor @@ websearch_to_tsquery('portuguese', :termo_usuario)
   OR (cardinality(te.lista_keywords_ia) > 0 AND c.tags && te.lista_keywords_ia)
ORDER BY score_final DESC, c.publicado_em DESC
LIMIT 20;

