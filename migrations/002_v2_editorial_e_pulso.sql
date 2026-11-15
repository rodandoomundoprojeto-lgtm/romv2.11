-- ============================================================================
-- Migração 002 — Motor V2 Editorial, Pulso (30m) & Atlas Comparado
-- Portal: Rodando o Mundo (www.rodandoomundo.com.br)
-- Referência: docs/arquitetura_v2.md (Seções 2 e 3)
-- ============================================================================

BEGIN;

-- ============================================================================
-- PARTE A: TABELAS PRINCIPAIS DE PULSO, CONTEXTO ("ENTENDA") E COLUNAS V2
-- ============================================================================

-- 1. Notícias Quentes (Pipeline de Pulso 30m — gemini-2.5-flash)
CREATE TABLE IF NOT EXISTS ai_noticias_quentes (
    id SERIAL PRIMARY KEY,
    slug VARCHAR(200) UNIQUE NOT NULL,
    batch_id VARCHAR(50),
    titulo_curto VARCHAR(160) NOT NULL,
    resumo_pulso TEXT NOT NULL,
    impacto_pratico TEXT,
    categoria VARCHAR(50) NOT NULL DEFAULT 'Geopolitica_Relacoes',
    paises_envolvidos TEXT[] DEFAULT '{}',
    urgencia_score INTEGER NOT NULL CHECK (urgencia_score BETWEEN 0 AND 100),
    relevancia_score INTEGER NOT NULL CHECK (relevancia_score BETWEEN 0 AND 100),
    nivel_confianca VARCHAR(20) NOT NULL DEFAULT 'alta' CHECK (nivel_confianca IN ('alta', 'media', 'preliminar')),
    ttl_horas INTEGER NOT NULL DEFAULT 6 CHECK (ttl_horas BETWEEN 1 AND 168),
    horas_em_destaque INTEGER NOT NULL DEFAULT 6 CHECK (horas_em_destaque BETWEEN 1 AND 24),
    veiculos_origem TEXT[] DEFAULT '{}',
    fontes_urls TEXT[] DEFAULT '{}',
    palavras_chave TEXT[] DEFAULT '{}',
    links_internos_relacionados JSONB NOT NULL DEFAULT '[]'::jsonb,
    payload_json JSONB,
    model_id VARCHAR(80) NOT NULL DEFAULT 'gemini-2.5-flash',
    status VARCHAR(30) NOT NULL DEFAULT 'aguardando_revisao' CHECK (status IN ('aguardando_revisao', 'ativo', 'expirado', 'arquivado')),
    destaque_ate TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '6 hours'),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_noticias_quentes_ativas_score
    ON ai_noticias_quentes (status, expires_at, urgencia_score DESC, relevancia_score DESC);
CREATE INDEX IF NOT EXISTS idx_ai_noticias_quentes_destaque
    ON ai_noticias_quentes (destaque_ate DESC);
CREATE INDEX IF NOT EXISTS idx_ai_noticias_quentes_categoria
    ON ai_noticias_quentes (categoria);
CREATE INDEX IF NOT EXISTS idx_ai_noticias_quentes_paises
    ON ai_noticias_quentes USING GIN (paises_envolvidos);
CREATE INDEX IF NOT EXISTS idx_ai_noticias_quentes_palavras_chave
    ON ai_noticias_quentes USING GIN (palavras_chave);


-- 2. Entenda o Assunto / Entenda o Contexto (Explicadores Didáticos & Geopolíticos)
CREATE TABLE IF NOT EXISTS ai_entenda_o_assunto (
    id SERIAL PRIMARY KEY,
    slug VARCHAR(200) UNIQUE NOT NULL,
    titulo_assunto VARCHAR(220) NOT NULL,
    pergunta_central VARCHAR(255) NOT NULL,
    resumo_executivo TEXT NOT NULL,
    contexto_historico TEXT NOT NULL,
    categoria VARCHAR(50) NOT NULL DEFAULT 'Geopolitica_Relacoes',
    paises_relacionados TEXT[] DEFAULT '{}',
    tags TEXT[] DEFAULT '{}',
    impactos_praticos JSONB NOT NULL DEFAULT '[]'::jsonb,
    perguntas_frequentes JSONB NOT NULL DEFAULT '[]'::jsonb,
    fontes_referencia JSONB NOT NULL DEFAULT '[]'::jsonb,
    links_acervo_interno JSONB NOT NULL DEFAULT '[]'::jsonb,
    relevancia_score INTEGER NOT NULL DEFAULT 85 CHECK (relevancia_score BETWEEN 0 AND 100),
    model_id VARCHAR(80) NOT NULL DEFAULT 'gemini-2.5-pro',
    status VARCHAR(30) NOT NULL DEFAULT 'aguardando_revisao' CHECK (status IN ('rascunho_auditado', 'aguardando_revisao', 'ativo', 'publicado', 'arquivado')),
    reviewed_by VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_entenda_o_assunto_status_score
    ON ai_entenda_o_assunto (status, relevancia_score DESC, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_entenda_o_assunto_categoria
    ON ai_entenda_o_assunto (categoria);
CREATE INDEX IF NOT EXISTS idx_ai_entenda_o_assunto_paises
    ON ai_entenda_o_assunto USING GIN (paises_relacionados);
CREATE INDEX IF NOT EXISTS idx_ai_entenda_o_assunto_tags
    ON ai_entenda_o_assunto USING GIN (tags);


-- 3. Colunas Editoriais (Análises Aprofundadas — gemini-2.5-pro)
CREATE TABLE IF NOT EXISTS ai_colunas_editoriais (
    id SERIAL PRIMARY KEY,
    slug VARCHAR(200) UNIQUE NOT NULL,
    titulo VARCHAR(255) NOT NULL,
    subtitulo TEXT NOT NULL,
    tese_central TEXT NOT NULL,
    corpo_markdown TEXT NOT NULL,
    resumo_seo VARCHAR(320) NOT NULL,
    categoria VARCHAR(50) NOT NULL DEFAULT 'Geopolitica_Relacoes',
    paises_abordados TEXT[] DEFAULT '{}',
    tags TEXT[] DEFAULT '{}',
    tempo_leitura_min INTEGER NOT NULL DEFAULT 5 CHECK (tempo_leitura_min BETWEEN 1 AND 60),
    impactos_praticos JSONB NOT NULL DEFAULT '[]'::jsonb,
    fontes_citadas JSONB NOT NULL DEFAULT '[]'::jsonb,
    links_acervo_interno JSONB NOT NULL DEFAULT '[]'::jsonb,
    auditoria_resultado JSONB,
    auditoria_aprovada BOOLEAN NOT NULL DEFAULT FALSE,
    aviso_correcao_material TEXT,
    model_id VARCHAR(80) NOT NULL DEFAULT 'gemini-2.5-pro',
    status VARCHAR(30) NOT NULL DEFAULT 'rascunho_auditado' CHECK (status IN ('rascunho_auditado', 'aguardando_revisao', 'aprovado', 'publicado', 'rejeitado')),
    review_status VARCHAR(30) NOT NULL DEFAULT 'rascunho_auditado' CHECK (review_status IN ('rascunho_auditado', 'aguardando_revisao', 'aprovado', 'publicado', 'rejeitado')),
    reviewed_by VARCHAR(100),
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_colunas_editoriais_status_pub
    ON ai_colunas_editoriais (review_status, published_at DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_colunas_editoriais_categoria
    ON ai_colunas_editoriais (categoria);
CREATE INDEX IF NOT EXISTS idx_ai_colunas_editoriais_paises
    ON ai_colunas_editoriais USING GIN (paises_abordados);
CREATE INDEX IF NOT EXISTS idx_ai_colunas_editoriais_tags
    ON ai_colunas_editoriais USING GIN (tags);


-- ============================================================================
-- PARTE B: GOVERNANÇA DE FONTES, EVENTOS COMPARADOS E AUDITORIA (SEÇÃO 2 V2.2)
-- ============================================================================

-- 4. Controle Operacional e Kill Switch
CREATE TABLE IF NOT EXISTS ai_config_operacional (
    chave VARCHAR(80) PRIMARY KEY,
    valor TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO ai_config_operacional (chave, valor)
VALUES ('publicacao_automatica_ativa', 'false')
ON CONFLICT (chave) DO NOTHING;

-- 5. Fontes Monitoradas e Política de Uso (Gerenciável via Dashboard)
CREATE TABLE IF NOT EXISTS ai_fontes_referencia (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(150) NOT NULL,
    url TEXT UNIQUE NOT NULL,
    pais_iso CHAR(2),
    regiao VARCHAR(60),
    idioma VARCHAR(10) NOT NULL DEFAULT 'pt',
    tipo_fonte VARCHAR(30) NOT NULL, -- 'rss_feed' | 'artigo_avulso' | 'fonte_primaria' | 'youtube_rss'
    cadencia VARCHAR(30) NOT NULL,   -- 'pulso_30m' | 'ciclo_3h' | 'biblioteca_v2'
    peso_confianca INTEGER DEFAULT 3 CHECK (peso_confianca BETWEEN 1 AND 5),

    -- Política operacional de uso (separada da confiança editorial)
    politica_uso_status VARCHAR(20) NOT NULL DEFAULT 'pendente', -- 'pendente' | 'aprovada' | 'restrita' | 'suspensa'
    base_documentada TEXT,
    referencia_condicoes_uso TEXT,
    coleta_permitida BOOLEAN NOT NULL DEFAULT FALSE,
    armazenamento_permitido VARCHAR(30) NOT NULL DEFAULT 'apenas_metadados', -- 'apenas_metadados' | 'trecho_temporario' | 'completo'
    retencao_definida VARCHAR(40) NOT NULL DEFAULT '0d_metadados',
    exibicao_permitida VARCHAR(40) NOT NULL DEFAULT 'sintese_e_link', -- 'sintese_e_link' | 'manchete_sintese_e_link'
    atribuicao_exigida VARCHAR(150),
    revisado_por VARCHAR(100),
    revisado_em TIMESTAMPTZ,

    ativo BOOLEAN DEFAULT TRUE,
    processado BOOLEAN DEFAULT FALSE,
    ultima_coleta_at TIMESTAMPTZ,
    ultimo_erro TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_fontes_referencia_ativas_cadencia
    ON ai_fontes_referencia (ativo, politica_uso_status, coleta_permitida, cadencia);

-- 6. Documentos Coletados (Rastreabilidade e Limitação de Auditoria)
CREATE TABLE IF NOT EXISTS ai_documentos_coletados (
    id SERIAL PRIMARY KEY,
    source_id INTEGER REFERENCES ai_fontes_referencia(id),
    canonical_url TEXT UNIQUE NOT NULL,
    titulo_original TEXT NOT NULL,
    idioma VARCHAR(10) NOT NULL,
    content_hash CHAR(64) NOT NULL, -- SHA-256 interno
    original_retido BOOLEAN NOT NULL DEFAULT FALSE,
    trecho_utilizado TEXT,          -- Preenchido somente se armazenamento_permitido != 'apenas_metadados'
    retencao_expira_em TIMESTAMPTZ, -- Para expurgo automático quando trecho_temporario
    limitacao_auditoria TEXT,       -- Registrado quando original_retido = FALSE
    published_at TIMESTAMPTZ,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_documentos_coletados_source_fetched
    ON ai_documentos_coletados (source_id, fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_documentos_coletados_hash
    ON ai_documentos_coletados (content_hash);

-- 7. Eventos (Entidade Central Comparada)
CREATE TABLE IF NOT EXISTS ai_eventos (
    id SERIAL PRIMARY KEY,
    slug VARCHAR(200) UNIQUE NOT NULL,
    titulo_evento VARCHAR(220) NOT NULL,
    categoria VARCHAR(50) NOT NULL,
    paises_envolvidos TEXT[] DEFAULT '{}',
    urgencia_score INTEGER NOT NULL CHECK (urgencia_score BETWEEN 0 AND 100),
    relevancia_score INTEGER NOT NULL CHECK (relevancia_score BETWEEN 0 AND 100),
    nivel_confianca VARCHAR(20) NOT NULL, -- 'alta' | 'media' | 'preliminar'
    aviso_correcao_material TEXT,
    destaque_ate TIMESTAMPTZ NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'aguardando_revisao',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_eventos_status_destaque
    ON ai_eventos (status, destaque_ate DESC, urgencia_score DESC, relevancia_score DESC);
CREATE INDEX IF NOT EXISTS idx_ai_eventos_paises
    ON ai_eventos USING GIN (paises_envolvidos);

-- 8. Coberturas e Documentos Vinculados ao Evento
CREATE TABLE IF NOT EXISTS ai_coberturas_por_veiculo (
    id SERIAL PRIMARY KEY,
    event_id INTEGER REFERENCES ai_eventos(id) ON DELETE CASCADE,
    documento_id INTEGER REFERENCES ai_documentos_coletados(id),
    veiculo_nome VARCHAR(120) NOT NULL,
    pais_veiculo CHAR(2),
    fonte_tipo VARCHAR(30) NOT NULL DEFAULT 'veiculo_imprensa', -- 'veiculo_imprensa' | 'fonte_primaria' | 'instituicao_pesquisa'
    peso_confianca INTEGER DEFAULT 3,
    manchete_original TEXT,         -- Exibida publicamente apenas se exibicao_permitida = 'manchete_sintese_e_link'
    enfoque_identificado TEXT NOT NULL,
    url_original TEXT NOT NULL,
    published_at TIMESTAMPTZ,
    UNIQUE(event_id, documento_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_coberturas_event_tipo
    ON ai_coberturas_por_veiculo (event_id, fonte_tipo, peso_confianca DESC);

-- 9. Evidências Extraídas
CREATE TABLE IF NOT EXISTS ai_evidencias (
    id SERIAL PRIMARY KEY,
    event_id INTEGER REFERENCES ai_eventos(id) ON DELETE CASCADE,
    documento_id INTEGER REFERENCES ai_documentos_coletados(id),
    tipo_evidencia VARCHAR(30) NOT NULL, -- 'fato_confirmado' | 'dado_numerico' | 'citacao' | 'ponto_incerto'
    afirmacao_publicada TEXT NOT NULL,
    parafrase_suporte TEXT NOT NULL,
    fonte_atribuida VARCHAR(150) NOT NULL,
    fonte_tipo VARCHAR(50) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_evidencias_event
    ON ai_evidencias (event_id);

-- 10. Conteúdos Versionados & Histórico de Revisões
CREATE TABLE IF NOT EXISTS ai_conteudos_gerados (
    id SERIAL PRIMARY KEY,
    event_id INTEGER REFERENCES ai_eventos(id) ON DELETE CASCADE,
    tipo_conteudo VARCHAR(40) NOT NULL,
    versao INTEGER NOT NULL DEFAULT 1,
    tipo_alteracao VARCHAR(30) DEFAULT 'criacao', -- 'criacao' | 'ajuste_menor' | 'correcao_material'
    nota_historico_publico TEXT,
    payload_json JSONB NOT NULL,
    evidence_ids INTEGER[] NOT NULL,
    model_id VARCHAR(80) NOT NULL,
    prompt_version VARCHAR(30) NOT NULL,
    review_status VARCHAR(30) NOT NULL DEFAULT 'aguardando_revisao',
    reviewed_by VARCHAR(100),
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_conteudos_gerados_event_versao
    ON ai_conteudos_gerados (event_id, tipo_conteudo, versao DESC);

-- 11. Auditoria das Execuções do Pipeline (Log e Telemetria — Não é Trava)
CREATE TABLE IF NOT EXISTS ai_execucoes_pipeline (
    id SERIAL PRIMARY KEY,
    job_nome VARCHAR(80) NOT NULL,
    recurso_chave VARCHAR(120) NOT NULL,
    status VARCHAR(30) NOT NULL, -- 'em_execucao' | 'concluido' | 'falha' | 'ignorado_lock_ocupado'
    documentos_novos INTEGER DEFAULT 0,
    eventos_atualizados INTEGER DEFAULT 0,
    erro_detalhe TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ai_execucoes_pipeline_recurso_started
    ON ai_execucoes_pipeline (recurso_chave, started_at DESC);


-- ============================================================================
-- PARTE C: SEED INICIAL DE FONTES PRIMÁRIAS & CANAIS OFICIAIS (SEÇÃO 2 V2.2)
-- ============================================================================

INSERT INTO ai_fontes_referencia (
    nome, url, pais_iso, regiao, idioma, tipo_fonte, cadencia, peso_confianca,
    politica_uso_status, base_documentada, referencia_condicoes_uso,
    coleta_permitida, armazenamento_permitido, retencao_definida,
    exibicao_permitida, atribuicao_exigida, revisado_por, revisado_em
) VALUES
-- BRASIL: PORTAIS E AGÊNCIAS OFICIAIS
('Notícias STF', 'https://portal.stf.jus.br/noticias/rss.asp', 'BR', 'America_do_Sul', 'pt', 'fonte_primaria', 'pulso_30m', 5, 'aprovada', 'Portal institucional oficial do STF', 'https://portal.stf.jus.br', TRUE, 'trecho_temporario', '30d', 'manchete_sintese_e_link', 'Supremo Tribunal Federal (STF)', 'Revisado por Equipe RoM', NOW()),
('TSE Notícias', 'https://www.tse.jus.br/noticias-em-rss', 'BR', 'America_do_Sul', 'pt', 'fonte_primaria', 'pulso_30m', 5, 'aprovada', 'Portal institucional oficial do TSE', 'https://www.tse.jus.br', TRUE, 'trecho_temporario', '30d', 'manchete_sintese_e_link', 'Tribunal Superior Eleitoral (TSE)', 'Revisado por Equipe RoM', NOW()),
('Agência Gov (Planalto)', 'https://agenciabrasil.ebc.com.br/rss/politica/feed.xml', 'BR', 'America_do_Sul', 'pt', 'fonte_primaria', 'pulso_30m', 5, 'aprovada', 'Agência oficial do Executivo Federal (EBC)', 'https://agenciagov.ebc.com.br', TRUE, 'trecho_temporario', '30d', 'manchete_sintese_e_link', 'Agência Gov / Governo Federal', 'Revisado por Equipe RoM', NOW()),
('Agência Senado', 'https://www12.senado.leg.br/noticias/feed/todasnoticias/RSS', 'BR', 'America_do_Sul', 'pt', 'fonte_primaria', 'pulso_30m', 5, 'aprovada', 'Agência de notícias oficial do Senado Federal', 'https://www12.senado.leg.br', TRUE, 'trecho_temporario', '30d', 'manchete_sintese_e_link', 'Agência Senado', 'Revisado por Equipe RoM', NOW()),
('Agência Câmara', 'https://www.camara.leg.br/noticias/rss', 'BR', 'America_do_Sul', 'pt', 'fonte_primaria', 'pulso_30m', 5, 'aprovada', 'Agência de notícias oficial da Câmara dos Deputados', 'https://www.camara.leg.br', TRUE, 'trecho_temporario', '30d', 'manchete_sintese_e_link', 'Agência Câmara', 'Revisado por Equipe RoM', NOW()),
('Banco Central do Brasil', 'https://www.bcb.gov.br/api/feed/sitebcb/sitefeeds/noticias', 'BR', 'America_do_Sul', 'pt', 'fonte_primaria', 'ciclo_3h', 5, 'aprovada', 'Comunicados e notícias oficiais do BCB', 'https://www.bcb.gov.br', TRUE, 'trecho_temporario', '30d', 'manchete_sintese_e_link', 'Banco Central do Brasil', 'Revisado por Equipe RoM', NOW()),
('Agência IBGE Notícias', 'https://agenciadenoticias.ibge.gov.br/agencia-noticias.xml', 'BR', 'America_do_Sul', 'pt', 'fonte_primaria', 'ciclo_3h', 5, 'aprovada', 'Dados estatísticos oficiais do IBGE', 'https://agenciadenoticias.ibge.gov.br', TRUE, 'trecho_temporario', '30d', 'manchete_sintese_e_link', 'IBGE', 'Revisado por Equipe RoM', NOW()),

-- BRASIL: YOUTUBE OFICIAL (RSS NATIVO)
('STF - YouTube Oficial', 'https://www.youtube.com/feeds/videos.xml?channel_id=UCsW4QSB1USsu9ouuFUWe4Iw', 'BR', 'America_do_Sul', 'pt', 'youtube_rss', 'ciclo_3h', 5, 'aprovada', 'Feed RSS oficial do canal do STF no YouTube', 'https://www.youtube.com/@STF_oficial', TRUE, 'apenas_metadados', '0d_metadados', 'manchete_sintese_e_link', 'STF (YouTube Oficial)', 'Revisado por Equipe RoM', NOW()),
('TSE - YouTube Oficial', 'https://www.youtube.com/feeds/videos.xml?channel_id=UC1kilS1DdyYOEGItHPRukBw', 'BR', 'America_do_Sul', 'pt', 'youtube_rss', 'ciclo_3h', 5, 'aprovada', 'Feed RSS oficial do canal do TSE no YouTube', 'https://www.youtube.com/@justicaeleitoral', TRUE, 'apenas_metadados', '0d_metadados', 'manchete_sintese_e_link', 'TSE (YouTube Oficial)', 'Revisado por Equipe RoM', NOW()),
('Canal Gov / Planalto - YouTube', 'https://www.youtube.com/feeds/videos.xml?channel_id=UCjaWLFTNqLkq3ZY2BJ4NYRg', 'BR', 'America_do_Sul', 'pt', 'youtube_rss', 'ciclo_3h', 5, 'aprovada', 'Feed RSS oficial do Canal Gov no YouTube', 'https://www.youtube.com/@canalgov', TRUE, 'apenas_metadados', '0d_metadados', 'manchete_sintese_e_link', 'Canal Gov (YouTube Oficial)', 'Revisado por Equipe RoM', NOW()),
('TV Senado - YouTube', 'https://www.youtube.com/feeds/videos.xml?channel_id=UCLgti7NuK0RuW9wty-fxPjQ', 'BR', 'America_do_Sul', 'pt', 'youtube_rss', 'ciclo_3h', 5, 'aprovada', 'Feed RSS oficial da TV Senado no YouTube', 'https://www.youtube.com/@tvsenado', TRUE, 'apenas_metadados', '0d_metadados', 'manchete_sintese_e_link', 'TV Senado (YouTube Oficial)', 'Revisado por Equipe RoM', NOW()),
('Câmara dos Deputados - YouTube', 'https://www.youtube.com/feeds/videos.xml?channel_id=UC-ZkSRh-7UEuwXJQ9UMCFJA', 'BR', 'America_do_Sul', 'pt', 'youtube_rss', 'ciclo_3h', 5, 'aprovada', 'Feed RSS oficial da Câmara no YouTube', 'https://www.youtube.com/@CamaradosDeputadosoficial', TRUE, 'apenas_metadados', '0d_metadados', 'manchete_sintese_e_link', 'Câmara dos Deputados (YouTube)', 'Revisado por Equipe RoM', NOW()),

-- INTERNACIONAL: FONTES PRIMÁRIAS
('ONU News (Português)', 'https://news.un.org/feed/subscribe/pt/news/all/rss.xml', 'UN', 'Global', 'pt', 'fonte_primaria', 'ciclo_3h', 5, 'aprovada', 'Serviço oficial de notícias das Nações Unidas', 'https://news.un.org/pt/', TRUE, 'trecho_temporario', '30d', 'manchete_sintese_e_link', 'ONU News', 'Revisado por Equipe RoM', NOW()),
('Comissão Europeia (Press Corner)', 'https://ec.europa.eu/commission/presscorner/api/rss?language=en', 'EU', 'Europa', 'en', 'fonte_primaria', 'ciclo_3h', 5, 'aprovada', 'Comunicados oficiais da Comissão Europeia', 'https://ec.europa.eu/commission/presscorner', TRUE, 'trecho_temporario', '30d', 'manchete_sintese_e_link', 'Comissão Europeia', 'Revisado por Equipe RoM', NOW()),
('White House Briefing Room', 'https://www.whitehouse.gov/briefings-statements/feed/', 'US', 'America_do_Norte', 'en', 'fonte_primaria', 'ciclo_3h', 5, 'aprovada', 'Comunicados oficiais da Presidência dos EUA', 'https://www.whitehouse.gov', TRUE, 'trecho_temporario', '30d', 'manchete_sintese_e_link', 'The White House', 'Revisado por Equipe RoM', NOW())
ON CONFLICT (url) DO NOTHING;

COMMIT;
