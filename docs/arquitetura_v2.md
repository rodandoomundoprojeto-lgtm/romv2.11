# Plano Definitivo V2.2 — Atlas Jornalístico Comparado, Governança de Fontes & Interface Limpa (`www.rodandoomundo.com.br`)

Este documento consolida a arquitetura definitiva do motor de inteligência e da interface do **Rodando o Mundo**, estruturada em **3 camadas de produto** e **2 camadas de interface** (*Progressive Disclosure*):

1. **Camada 1 — Atlas:** Descoberta de veículos por país, região e tema.
2. **Camada 2 — Acontecimento (Leitura Limpa e Comparada):** Título neutro, síntese identificada com ressalvas integradas, 2 a 3 coberturas jornalísticas iniciais e acesso único a **"Fontes e verificação"** e **"Entenda o contexto"**.
3. **Camada 3 — Painel Único de Verificação & Contexto (Sob Demanda):** Painel lateral único (desktop) / tela ampla (mobile) entregando cada afirmação resolvida com sua paráfrase verificada, documentos oficiais, datas e links originais, sem exposição de IDs, hashes ou estados internos.

---

## 1. Regras Editoriais, Política de Fontes e Governança

### Política de coleta, armazenamento e exibição de fontes
O **Rodando o Mundo** distingue três operações: **coleta de conteúdo**, **armazenamento interno** e **exibição pública**. As condições aplicáveis a cada operação devem ser avaliadas e registradas por fonte.

* O uso de paráfrase não será tratado como garantia automática de conformidade. Da mesma forma, o armazenamento restrito ao ambiente interno não será considerado, isoladamente, autorização para conservar qualquer conteúdo.
* A apresentação pública priorizará sínteses próprias e atribuídas, identificação da fonte e links para os documentos originais (`exibicao_permitida = 'sintese_e_link'` como padrão no piloto). A exibição de manchetes literais, citações, imagens e outros elementos deverá observar a política aprovada para o material.
* A retenção interna de trechos ou documentos deverá respeitar as condições adotadas para a fonte. Quando não houver autorização de retenção do conteúdo original, o coletor descarta o texto integral após o processamento, registra apenas os metadados disponíveis (`canonical_url`, `content_hash`, datas) e marca a limitação correspondente da auditoria (`original_retido = false`).
* Paráfrases e resumos são formas de apresentação editorial. Não constituem fontes adicionais nem confirmações independentes da informação original.
* **Canais Institucionais no YouTube (`youtube_rss`):** A coleta de canais oficiais no YouTube (STF, TSE, Canal Gov, TV Senado, Câmara) deve utilizar **exclusivamente os feeds RSS nativos públicos** (`https://www.youtube.com/feeds/videos.xml?channel_id=...`), conservando apenas metadados textuais (título, descrição oficial do vídeo e URL), sem scraping de HTML nem download de arquivos de áudio/vídeo.

#### Registro operacional por fonte
Cada fonte possui um registro de política de uso separado da sua avaliação editorial de confiança (`peso_confianca`):

| Campo | Finalidade |
| :--- | :--- |
| `politica_uso_status` | Indicar se a avaliação está `pendente`, `aprovada`, `restrita` ou `suspensa` |
| `base_documentada` | Registrar condições, autorização ou fundamento considerado na avaliação |
| `referencia_condicoes_uso` | Localizar os termos ou documentos consultados |
| `coleta_permitida` | Registrar a decisão operacional sobre coleta (`true` / `false`) |
| `armazenamento_permitido` | Definir quais materiais podem ser conservados (`apenas_metadados` \| `trecho_temporario` \| `completo`) |
| `retencao_definida` | Registrar prazo ou regra de retenção (ex.: `0d_metadados`, `7d`, `30d`, `indeterminado`) |
| `exibicao_permitida` | Definir os elementos autorizados (`sintese_e_link` \| `manchete_sintese_e_link`) |
| `atribuicao_exigida` | Registrar como a fonte deve ser identificada |
| `revisado_por` | Identificar o responsável pela decisão (ex.: `"Revisado por Equipe RoM"`) |
| `revisado_em` | Registrar a data/hora da revisão |

> **Ressalva obrigatória:** Esses campos documentam decisões e condições aplicáveis; não criam permissões por si mesmos. Na ausência de uma política aprovada (`politica_uso_status != 'aprovada'`), a fonte não será habilitada para coleta automatizada ou reprodução de conteúdo no piloto. O cadastro de um link no catálogo do **Atlas** será tratado separadamente.

### Regras Editoriais e Visuais Complementares
* **Identificação Visual Clara:** Todo título de agrupamento ou síntese recebe o selo discreto *"Síntese Rodando o Mundo"* e o horário da atualização (`Atualizado às HHhMM`).
* **Ressalvas Integradas ao Texto:** Incertezas ou pendências relevantes que alteram a interpretação devem aparecer diretamente no texto da síntese, nunca escondidas apenas no painel de fontes.
* **Isolamento de Fontes Primárias vs. Coberturas Jornalísticas:** Fontes governamentais, judiciárias, legislativas e organismos multilaterais (`tipo_fonte IN ('fonte_primaria', 'youtube_rss')`) atuam como âncoras factuais na síntese e nas evidências verificadas, **nunca competindo pelos 2 a 3 cards de destaque de imprensa** (`coberturas_destaque`), exceto em regime de *fallback* (máximo de 1 card identificado como *"Comunicado Oficial / Fonte Primária"*) enquanto ainda não houver cobertura jornalística vinculada ao evento. No Painel de Verificação (Camada 3), são exibidas em subseção própria (**"Documentos e Comunicados Oficiais"**).
* **Seleção Híbrida de Coberturas em Destaque (2 a 3 cards):** O backend seleciona as 2 ou 3 coberturas jornalísticas principais (`fonte_tipo = 'veiculo_imprensa'`) combinando **maior `peso_confianca` + recência** com **diversidade de país/região** (`pais_veiculo`).
* **Correções Materiais vs. Ajustes Menores:** Ao editar um evento publicado no Dashboard, o editor escolhe entre `ajuste_menor` (histórico secundário) ou `correcao_material` (banner de errata visível na página + histórico público).
* **Representação Proporcional às Evidências:** Proibida a falsa simetria binária ("Tese A vs. Tese B" forçada).
* **Fila de Revisão + Kill Switch:** Todos os conteúdos gerados entram inicialmente como `aguardando_revisao`, com botão global (`publicacao_automatica_ativa`) no Dashboard.

---

## 2. Arquitetura de Banco de Dados (`PostgreSQL`)

```sql
-- 1. Controle Operacional e Kill Switch
CREATE TABLE IF NOT EXISTS ai_config_operacional (
    chave VARCHAR(80) PRIMARY KEY,
    valor TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO ai_config_operacional (chave, valor) 
VALUES ('publicacao_automatica_ativa', 'false')
ON CONFLICT (chave) DO NOTHING;

-- 2. Fontes Monitoradas e Política de Uso (Gerenciável via Dashboard)
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

-- 3. Documentos Coletados (Rastreabilidade e Limitação de Auditoria)
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

-- 4. Eventos (Entidade Central)
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

-- 5. Coberturas e Documentos Vinculados ao Evento
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

-- 6. Evidências Extraídas
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

-- 7. Conteúdos Versionados & Histórico de Revisões
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
```

### Seed Inicial de Fontes Primárias & Canais Oficiais (Brasil e Internacional)

```sql
INSERT INTO ai_fontes_referencia (
    nome, url, pais_iso, regiao, idioma, tipo_fonte, cadencia, peso_confianca,
    politica_uso_status, base_documentada, referencia_condicoes_uso,
    coleta_permitida, armazenamento_permitido, retencao_definida,
    exibicao_permitida, atribuicao_exigida, revisado_por, revisado_em
) VALUES
-- BRASIL: PORTAIS E AGÊNCIAS OFICIAIS
('Notícias STF', 'https://portal.stf.jus.br/noticias/rss.asp', 'BR', 'America_do_Sul', 'pt', 'fonte_primaria', 'pulso_30m', 5, 'aprovada', 'Portal institucional oficial do STF', 'https://portal.stf.jus.br', TRUE, 'trecho_temporario', '30d', 'manchete_sintese_e_link', 'Supremo Tribunal Federal (STF)', 'Revisado por Equipe RoM', NOW()),
('TSE Notícias', 'https://www.tse.jus.br/comunicacao/noticias/rss', 'BR', 'America_do_Sul', 'pt', 'fonte_primaria', 'pulso_30m', 5, 'aprovada', 'Portal institucional oficial do TSE', 'https://www.tse.jus.br', TRUE, 'trecho_temporario', '30d', 'manchete_sintese_e_link', 'Tribunal Superior Eleitoral (TSE)', 'Revisado por Equipe RoM', NOW()),
('Agência Gov (Planalto)', 'https://agenciagov.ebc.com.br/rss', 'BR', 'America_do_Sul', 'pt', 'fonte_primaria', 'pulso_30m', 5, 'aprovada', 'Agência oficial do Executivo Federal (EBC)', 'https://agenciagov.ebc.com.br', TRUE, 'trecho_temporario', '30d', 'manchete_sintese_e_link', 'Agência Gov / Governo Federal', 'Revisado por Equipe RoM', NOW()),
('Agência Senado', 'https://www12.senado.leg.br/noticias/feed/todasnoticias/RSS', 'BR', 'America_do_Sul', 'pt', 'fonte_primaria', 'pulso_30m', 5, 'aprovada', 'Agência de notícias oficial do Senado Federal', 'https://www12.senado.leg.br', TRUE, 'trecho_temporario', '30d', 'manchete_sintese_e_link', 'Agência Senado', 'Revisado por Equipe RoM', NOW()),
('Agência Câmara', 'https://www.camara.leg.br/noticias/rss/todas-as-noticias', 'BR', 'America_do_Sul', 'pt', 'fonte_primaria', 'pulso_30m', 5, 'aprovada', 'Agência de notícias oficial da Câmara dos Deputados', 'https://www.camara.leg.br', TRUE, 'trecho_temporario', '30d', 'manchete_sintese_e_link', 'Agência Câmara', 'Revisado por Equipe RoM', NOW()),
('Banco Central do Brasil', 'https://www.bcb.gov.br/api/feed/sitebcb/sitefeeds/noticias', 'BR', 'America_do_Sul', 'pt', 'fonte_primaria', 'ciclo_3h', 5, 'aprovada', 'Comunicados e notícias oficiais do BCB', 'https://www.bcb.gov.br', TRUE, 'trecho_temporario', '30d', 'manchete_sintese_e_link', 'Banco Central do Brasil', 'Revisado por Equipe RoM', NOW()),
('Agência IBGE Notícias', 'https://agenciadenoticias.ibge.gov.br/agencia-noticias.xml', 'BR', 'America_do_Sul', 'pt', 'fonte_primaria', 'ciclo_3h', 5, 'aprovada', 'Dados estatísticos oficiais do IBGE', 'https://agenciadenoticias.ibge.gov.br', TRUE, 'trecho_temporario', '30d', 'manchete_sintese_e_link', 'IBGE', 'Revisado por Equipe RoM', NOW()),

-- BRASIL: YOUTUBE OFICIAL (RSS NATIVO)
('STF - YouTube Oficial', 'https://www.youtube.com/feeds/videos.xml?channel_id=UC0qlZ5jxxueWRwvuUllpnWk', 'BR', 'America_do_Sul', 'pt', 'youtube_rss', 'ciclo_3h', 5, 'aprovada', 'Feed RSS oficial do canal do STF no YouTube', 'https://www.youtube.com/@STF_oficial', TRUE, 'apenas_metadados', '0d_metadados', 'manchete_sintese_e_link', 'STF (YouTube Oficial)', 'Revisado por Equipe RoM', NOW()),
('TSE - YouTube Oficial', 'https://www.youtube.com/feeds/videos.xml?channel_id=UC1kilS1IWUYKC9sbtn0KV1g', 'BR', 'America_do_Sul', 'pt', 'youtube_rss', 'ciclo_3h', 5, 'aprovada', 'Feed RSS oficial do canal do TSE no YouTube', 'https://www.youtube.com/@tsejus', TRUE, 'apenas_metadados', '0d_metadados', 'manchete_sintese_e_link', 'TSE (YouTube Oficial)', 'Revisado por Equipe RoM', NOW()),
('Canal Gov / Planalto - YouTube', 'https://www.youtube.com/feeds/videos.xml?channel_id=UCu21-d2_393r5g0w4-pG6xQ', 'BR', 'America_do_Sul', 'pt', 'youtube_rss', 'ciclo_3h', 5, 'aprovada', 'Feed RSS oficial do Canal Gov no YouTube', 'https://www.youtube.com/@canalgov', TRUE, 'apenas_metadados', '0d_metadados', 'manchete_sintese_e_link', 'Canal Gov (YouTube Oficial)', 'Revisado por Equipe RoM', NOW()),
('TV Senado - YouTube', 'https://www.youtube.com/feeds/videos.xml?channel_id=UCLgti7NuK0RuW9wty-fxPjQ', 'BR', 'America_do_Sul', 'pt', 'youtube_rss', 'ciclo_3h', 5, 'aprovada', 'Feed RSS oficial da TV Senado no YouTube', 'https://www.youtube.com/@tvsenado', TRUE, 'apenas_metadados', '0d_metadados', 'manchete_sintese_e_link', 'TV Senado (YouTube Oficial)', 'Revisado por Equipe RoM', NOW()),
('Câmara dos Deputados - YouTube', 'https://www.youtube.com/feeds/videos.xml?channel_id=UC-ZkSRh-7UEuwXJQ9UMCFJA', 'BR', 'America_do_Sul', 'pt', 'youtube_rss', 'ciclo_3h', 5, 'aprovada', 'Feed RSS oficial da Câmara no YouTube', 'https://www.youtube.com/@CamaradosDeputadosoficial', TRUE, 'apenas_metadados', '0d_metadados', 'manchete_sintese_e_link', 'Câmara dos Deputados (YouTube)', 'Revisado por Equipe RoM', NOW()),

-- INTERNACIONAL: FONTES PRIMÁRIAS
('ONU News (Português)', 'https://news.un.org/feed/subscribe/pt/news/all/rss.xml', 'UN', 'Global', 'pt', 'fonte_primaria', 'ciclo_3h', 5, 'aprovada', 'Serviço oficial de notícias das Nações Unidas', 'https://news.un.org/pt/', TRUE, 'trecho_temporario', '30d', 'manchete_sintese_e_link', 'ONU News', 'Revisado por Equipe RoM', NOW()),
('Comissão Europeia (Press Corner)', 'https://ec.europa.eu/commission/presscorner/api/rss?language=en', 'EU', 'Europa', 'en', 'fonte_primaria', 'ciclo_3h', 5, 'aprovada', 'Comunicados oficiais da Comissão Europeia', 'https://ec.europa.eu/commission/presscorner', TRUE, 'trecho_temporario', '30d', 'manchete_sintese_e_link', 'Comissão Europeia', 'Revisado por Equipe RoM', NOW()),
('White House Briefing Room', 'https://www.whitehouse.gov/feed/', 'US', 'America_do_Norte', 'en', 'fonte_primaria', 'ciclo_3h', 5, 'aprovada', 'Comunicados oficiais da Presidência dos EUA', 'https://www.whitehouse.gov', TRUE, 'trecho_temporario', '30d', 'manchete_sintese_e_link', 'The White House', 'Revisado por Equipe RoM', NOW())
ON CONFLICT (url) DO NOTHING;
```

### Auditoria das execuções do pipeline
A tabela `ai_execucoes_pipeline` registra tentativas, andamento, resultados e falhas dos jobs. **Sua existência não implementa exclusão mútua.** Consultar a ausência de uma execução ativa e, em seguida, inserir uma nova execução não será aceito como mecanismo suficiente de trava. O controle de concorrência deverá utilizar o mecanismo explícito definido na Seção 3.

```sql
-- 8. Auditoria das Execuções do Pipeline (Apenas Log e Telemetria — Não é Trava)
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
```

---

## 3. Especificação Operacional: Exclusão Mútua, Idempotência e Auditoria

O pipeline implementa três responsabilidades distintas, e nenhum desses mecanismos substitui os demais:
1. **Exclusão mútua:** Impedir operações concorrentes conflitantes sobre o mesmo recurso.
2. **Idempotência:** Impedir que a repetição de uma operação produza efeitos indevidamente duplicados (`UNIQUE(canonical_url)` e `UNIQUE(event_id, documento_id)`).
3. **Auditoria:** Registrar tentativas, decisões, resultados e falhas em `ai_execucoes_pipeline` (incluindo tentativas abortadas com `status = 'ignorado_lock_ocupado'`).

### Decisão Técnica e Contrato de Execução Protegida
* **Mecanismo escolhido:** **PostgreSQL Session-Level Advisory Locks** (`SELECT pg_try_advisory_lock(hashtext(recurso_chave))` e `SELECT pg_advisory_unlock(hashtext(recurso_chave))`) mantidos em uma conexão dedicada durante todo o ciclo da operação protegida.
* **Por que Session-Level e não Transaction-Level:** Operações de coleta HTTP e chamadas à API do Gemini atravessam múltiplas etapas; uma trava de transação seria liberada prematuramente ao fechar o primeiro `COMMIT`. Com o *Session-Level Advisory Lock* em conexão dedicada (sem *connection pooling* transacional no meio), a trava permanece ativa do início ao fim da operação e é **liberada automaticamente pelo PostgreSQL** caso o worker caia ou perca conexão, evitando bloqueios indefinidos.
* **Granularidade das chaves protegidas (`recurso_chave`):**
  * Coleta por fonte: `coleta_fonte:{source_id}` (permite coletar fontes diferentes em paralelo, mas impede duas coletas simultâneas da mesma fonte).
  * Consolidação de evento: `evento_consolida:{slug}` (impede atualizações concorrentes no mesmo evento).
* **Comportamento quando a trava estiver ocupada:** Retorna imediatamente sem esperar, registra `status = 'ignorado_lock_ocupado'` em `ai_execucoes_pipeline` e encerra o worker limpo.
* **Unicidade de caminho:** Agendamentos Cron, retentativas e botões de execução manual no Dashboard invocam exatamente a mesma função encapsulada pelo gerenciador de contexto `with advisory_lock(conn, recurso_chave):`.

---

## 4. Contratos Pydantic (Internos vs. Frontend Limpo) (`redacao_v2/schemas.py`)

```python
from typing import List, Literal, Optional
from pydantic import BaseModel, Field

CategoriaAtlas = Literal[
    "Geopolitica_Relacoes",
    "Economia_Comercio",
    "Sociedade_Cultura",
    "Mobilidade_Fronteiras",
    "Ciencia_Clima"
]

FonteTipoLiteral = Literal["veiculo_imprensa", "fonte_primaria", "instituicao_pesquisa"]

class ImpactoPublico(BaseModel):
    publico: Literal["cidadaos_locais", "viajantes_mobilidade", "empresas_comercio", "pesquisadores", "geral"]
    consequencia_pratica: str

class LinkAcervoInterno(BaseModel):
    titulo_existente: str
    url_existente: str
    motivo_conexao: str

class CoberturaVeiculoItem(BaseModel):
    documento_id: int
    veiculo_nome: str
    pais_veiculo: str
    fonte_tipo: FonteTipoLiteral
    manchete_original: str
    enfoque_identificado: str
    url_original: str

class EvidenciaItem(BaseModel):
    documento_id: int
    tipo_evidencia: Literal["fato_confirmado", "dado_numerico", "citacao", "ponto_incerto"]
    afirmacao_publicada: str
    parafrase_suporte: str
    fonte_atribuida: str
    fonte_tipo: FonteTipoLiteral

class EventoComparado(BaseModel):
    evento_existente_id: Optional[int] = None
    slug: str
    titulo_evento: str = Field(max_length=120)
    categoria: CategoriaAtlas
    paises_envolvidos: List[str]
    urgencia_score: int = Field(ge=0, le=100)
    relevancia_score: int = Field(ge=0, le=100)
    nivel_confianca: Literal["alta", "media", "preliminar"]
    horas_em_destaque: int = Field(ge=2, le=24, default=6)
    sintese_com_ressalvas: str
    coberturas: List[CoberturaVeiculoItem]
    evidencias: List[EvidenciaItem]

# --- CONTRATOS LIMPOS ENTREGUES AO FRONTEND PÚBLICO ---
class CoberturaPublica(BaseModel):
    veiculo_nome: str
    pais_veiculo: str
    fonte_tipo: FonteTipoLiteral
    eh_fallback_oficial: bool = False
    manchete_original: Optional[str] = None # Preenchido apenas se exibicao_permitida == 'manchete_sintese_e_link'
    enfoque_identificado: str
    url_original: str

class EventoPaginaPrincipal(BaseModel):
    slug: str
    categoria: str
    titulo_evento: str
    identificacao_editorial: str = "Síntese Rodando o Mundo"
    atualizado_em: str
    sintese_com_ressalvas: str
    aviso_correcao_material: Optional[str] = None
    coberturas_destaque: List[CoberturaPublica] # Prioriza veiculo_imprensa; usa fonte_primaria apenas em fallback
    total_coberturas_imprensa: int
    total_fontes_primarias: int
    tem_contexto_disponivel: bool

class EvidenciaResolvidaPublica(BaseModel):
    afirmacao_publicada: str
    parafrase_suporte: str
    fonte_nome: str
    fonte_tipo: str
    publicado_em: Optional[str]
    consultado_em: str
    url_original: str

class PainelVerificacaoEvento(BaseModel):
    slug: str
    afirmacoes_verificadas: List[EvidenciaResolvidaPublica]
    coberturas_imprensa: List[CoberturaPublica]
    documentos_oficiais: List[CoberturaPublica] # Subseção dedicada para fonte_primaria e youtube_rss
    historico_publico_alteracoes: List[str]
```

---

## 5. Ordem de Implementação Segura (Etapas 0 a 5)

### Etapa 0: Base Pública e Roteamento (`Frontend / SEO`)
* Corrigir o retorno de `"Erro 404 - Página não encontrada"` no HTML inicial entregue a crawlers em `www.rodandoomundo.com.br`.

### Etapa 1: Banco Orientado a Eventos, Política de Fontes & Coleta Protegida (`Backend`)
* Rodar as migrations SQL e o seed inicial da Seção 2.
* Criar o coletor incremental com controle explícito de concorrência (`pg_try_advisory_lock` por `coleta_fonte:{id}`), idempotência (`canonical_url` / `content_hash`) e auditoria em `ai_execucoes_pipeline`. O mecanismo de trava e o recurso protegido deverão estar documentados e cobertos por testes concorrentes.
* Suportar feeds RSS tradicionais (`rss_feed`, `fonte_primaria`) e feeds XML nativos de canais oficiais (`youtube_rss`, extraindo título, descrição oficial e URL sem download de vídeo).
* Habilitar coleta e exibição somente conforme a política de uso registrada (`politica_uso_status = 'aprovada'`), mantendo separadas a confiança editorial atribuída ao veículo e as condições de uso do seu conteúdo.

### Etapa 2: Agrupamento por Eventos & Comparação de Coberturas (`Pulso 30m`)
* Implementar o agrupamento de documentos em `ai_eventos` protegido por lock `evento_consolida:{slug}`, extraindo `ai_evidencias` e `ai_coberturas_por_veiculo`.
* Implementar a **regra de isolamento de fontes primárias**: selecionar os 2–3 cards de `coberturas_destaque` filtrando `fonte_tipo = 'veiculo_imprensa'` (combinando `peso_confianca` + recência + diversidade de país). Caso ainda não haja cobertura de imprensa para o evento, aplicar o *fallback* exibindo no máximo 1 card marcado com `eh_fallback_oficial = True` (*"Comunicado Oficial / Fonte Primária"*).

### Etapa 3: Interface Limpa (2 Camadas) + "Entenda o Contexto" + Dashboard de Governança
* **Frontend Público:** Camada 1 limpa + Painel lateral único **"Fontes e verificação"** (separando `coberturas_imprensa` e `documentos_oficiais`) + aba/acordeão **"Entenda o contexto"**.
* **Dashboard Admin:** Fila de aprovação, seletor `ajuste_menor` vs. `correcao_material`, Kill Switch (`publicacao_automatica_ativa`) e cadastro de fontes com opção de aprovação rápida de feed RSS público preenchendo `revisado_por = "Revisado por Equipe RoM"`.

### Etapa 4: Automação Gradual com Monitoramento
* Ativar agendamentos com limites de tempo/custo e alertas de feeds indisponíveis.

### Etapa 5: Colunista Analítico Aprofundado (Expansão Futura)
* Adicionar o pipeline de análises longas baseado nos eventos consolidados, com revisão humana obrigatória.

---

## 6. Critérios de Aceite Obrigatórios (Bloqueios para Ativação da Automação)

| Área | Critério de Aceite Verificável |
| :--- | :--- |
| **Política das fontes** | Toda fonte habilitada para coleta possui `politica_uso_status = 'aprovada'`, `coleta_permitida = true` e `revisado_por` preenchido. |
| **Isolamento de fontes primárias** | Fontes governamentais/oficiais não ocupam os cards de destaque da página principal quando houver veículos de imprensa vinculados ao evento. |
| **Coleta YouTube RSS** | Canais oficiais do YouTube são coletados apenas via XML RSS público (`apenas_metadados`), sem scraping HTML ou download de mídia. |
| **Armazenamento** | O coletor conserva somente o material permitido por `armazenamento_permitido` (descartando texto original quando `apenas_metadados`). |
| **Exibição pública** | A resposta pública respeita `exibicao_permitida` (exibindo `manchete_original` apenas quando explicitamente autorizado). |
| **Limitação de auditoria** | Quando o original não é retido (`original_retido = false`), essa limitação fica registrada internamente em `limitacao_auditoria`. |
| **Concorrência** | Teste automatizado confirma que duas tentativas simultâneas sobre o mesmo `recurso_chave` não executam a operação conflitante ao mesmo tempo. |
| **Acionamento manual** | Os endpoints acionados pelo Dashboard usam exatamente a mesma função de lock usada pelos jobs agendados. |
| **Recuperação** | Uma execução interrompida libera o *Session-Level Advisory Lock* no PostgreSQL e pode ser retomada sem bloqueio indefinido. |
| **Reexecução** | Repetir uma operação sobre os mesmos itens não duplica documentos, coberturas ou publicações. |
| **Auditoria** | A tabela `ai_execucoes_pipeline` permite distinguir execução `concluido`, `falha` e tentativa `ignorado_lock_ocupado`. |

---

## 7. Registro de Revisão — Política de Fontes e Segurança Operacional

| Alteração | Formulação Anterior | Formulação Revisada (V2.2) |
| :--- | :--- | :--- |
| **Fontes Primárias e YouTube** | Apenas `rss_feed`, `artigo_avulso` e `fonte_primaria` genérica | Inclusão de `youtube_rss` (metadados via feed XML oficial) e seed SQL de órgãos brasileiros e internacionais |
| **Destaque na Página Principal** | Seleção híbrida única entre todas as fontes | Isolamento de `fonte_primaria` nos cards principais (priorizando `veiculo_imprensa`, com *fallback* oficial rotulado) |
| **Painel de Verificação** | Lista única `todas_coberturas` | Separação clara entre `coberturas_imprensa` e `documentos_oficiais` |
| **Uso de conteúdo** | Paráfrase pública apresentada como proteção de direitos autorais | Política separada para coleta, armazenamento e exibição por fonte, sem garantia automática por paráfrase |
| **Controle de concorrência** | Tabela de execuções associada à trava | Mecanismo explícito de exclusão mútua (`pg_try_advisory_lock` por recurso), separado da auditoria em `ai_execucoes_pipeline` |
| **Validação** | Objetivos descritivos | Critérios de aceite e testes concorrentes obrigatórios antes de ativar a automação |

> *Esta revisão altera requisitos de governança e implementação. Não representa validação jurídica das fontes cadastradas nem comprovação de que os mecanismos operacionais já foram implementados. A conclusão de cada requisito dependerá da revisão correspondente e das evidências de teste.*