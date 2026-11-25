-- Migration 010: Tabelas de Controle da IA Juíza (Tribunal Noturno & Calibrações)
-- Motor V2 - Rodando o Mundo

-- 1. Acórdãos Diários Emitidos pela IA Juíza
CREATE TABLE IF NOT EXISTS ai_juiza_acordaos (
    id SERIAL PRIMARY KEY,
    batch_data DATE NOT NULL UNIQUE,
    data_sessao TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    modelo_juiza VARCHAR(80) NOT NULL,
    total_avaliados INTEGER NOT NULL DEFAULT 0,
    media_isencao NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    media_qualidade_nerd NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    alucinacoes_detectadas INTEGER NOT NULL DEFAULT 0,
    cliches_detectados INTEGER NOT NULL DEFAULT 0,
    veredito_geral VARCHAR(50) NOT NULL, -- 'excelente', 'aprovado_com_ressalvas', 'necessita_calibracao_rigorosa'
    resumo_acordao TEXT NOT NULL,
    pontos_cegos_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    itens_avaliados_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    calibracoes_geradas_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_juiza_acordaos_data ON ai_juiza_acordaos(batch_data DESC);

-- 2. Diretrizes e Calibrações Ativas para as IAs Operárias
CREATE TABLE IF NOT EXISTS ai_juiza_calibracoes_ativas (
    id SERIAL PRIMARY KEY,
    acordao_id INTEGER REFERENCES ai_juiza_acordaos(id) ON DELETE CASCADE,
    alvo_agente VARCHAR(50) NOT NULL, -- 'pulso_30m', 'colunista_nerd', 'pesquisador_factual', 'todos'
    tipo_diretriz VARCHAR(40) NOT NULL, -- 'alerta_factual', 'ajuste_tom', 'foco_tematico', 'cuidado_geopolitico'
    titulo_regra VARCHAR(150) NOT NULL,
    instrucao_prompt TEXT NOT NULL,
    prioridade INTEGER NOT NULL DEFAULT 1 CHECK (prioridade BETWEEN 1 AND 5),
    ativa BOOLEAN NOT NULL DEFAULT TRUE,
    valida_ate TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_juiza_calibracoes_ativas ON ai_juiza_calibracoes_ativas(ativa, valida_ate);

-- 3. Exemplares Padrão-Ouro (Golden Exemplars) para Few-Shot Prompts
CREATE TABLE IF NOT EXISTS ai_juiza_golden_exemplars (
    id SERIAL PRIMARY KEY,
    acordao_id INTEGER REFERENCES ai_juiza_acordaos(id) ON DELETE SET NULL,
    tipo_conteudo VARCHAR(40) NOT NULL, -- 'pulso_noticia', 'coluna_editorial', 'entenda_assunto'
    titulo VARCHAR(220) NOT NULL,
    categoria VARCHAR(50) NOT NULL,
    nota_isencao NUMERIC(5, 2) NOT NULL,
    texto_exemplo TEXT NOT NULL,
    justificativa_excelencia TEXT NOT NULL,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Registro Histórico de Ajuste de Confiança das Fontes
CREATE TABLE IF NOT EXISTS ai_juiza_log_calibracao_fontes (
    id SERIAL PRIMARY KEY,
    acordao_id INTEGER REFERENCES ai_juiza_acordaos(id) ON DELETE CASCADE,
    fonte_id INTEGER REFERENCES ai_fontes_referencia(id) ON DELETE CASCADE,
    peso_anterior INTEGER NOT NULL,
    novo_peso INTEGER NOT NULL,
    motivo TEXT NOT NULL,
    ajustado_automaticamente BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
