"""Contratos Pydantic v2 para o Motor Editorial V2 e Pulso (30m) do Rodando o Mundo.

Inclui:
  - Schemas de Pulso, Contexto ("Entenda o Assunto"), Interface, Pipeline Editorial (4 etapas) e Auditoria:
      NoticiaQuenteItem, PayloadNoticiasQuentes, BlocoEntendaOAssunto,
      InteligenciaInterfaceSite, DossiePesquisaFactual, ParecerAdvogadoDiabo,
      ColunaEditorial, ResultadoAuditoria
  - Schemas do Atlas Comparado e Governança de Fontes (docs/arquitetura_v2.md - Seção 4):
      CategoriaAtlas, FonteTipoLiteral, ImpactoPublico, LinkAcervoInterno,
      CoberturaVeiculoItem, EvidenciaItem, EventoComparado,
      CoberturaPublica, EventoPaginaPrincipal, EvidenciaResolvidaPublica, PainelVerificacaoEvento
"""
from datetime import datetime, timezone
from typing import List, Literal, Optional
from pydantic import BaseModel, Field, model_validator

# ============================================================================
# 1. TIPOS LITERAIS & BLOCOS BASE (SEÇÃO 4 DE docs/arquitetura_v2.md)
# ============================================================================

CategoriaAtlas = Literal[
    "Geopolitica_Relacoes",
    "Economia_Comercio",
    "Sociedade_Cultura",
    "Mobilidade_Fronteiras",
    "Ciencia_Clima"
]

FonteTipoLiteral = Literal[
    "veiculo_imprensa",
    "fonte_primaria",
    "instituicao_pesquisa"
]

NivelConfiancaLiteral = Literal["alta", "media", "preliminar"]


class ImpactoPublico(BaseModel):
    """Consequência prática segmentada por perfil de leitor/viajante."""
    publico: Literal[
        "cidadaos_locais",
        "viajantes_mobilidade",
        "empresas_comercio",
        "pesquisadores",
        "geral"
    ] = Field(default="geral", description="Público impactado pelo acontecimento")
    consequencia_pratica: str = Field(
        description="Explicação direta do impacto prático para este grupo"
    )


class LinkAcervoInterno(BaseModel):
    """Link interno para artigo, evento ou rota existente em rodandoomundo.com.br.
    Regra obrigatória: url_existente DEVE ser validada contra o banco (`conteudos` / `ai_eventos`) ou `sitemap.xml`.
    """
    titulo_existente: str = Field(description="Título real do artigo ou página existente no portal")
    url_existente: str = Field(description="URL interna validada contra banco de dados ou sitemap.xml")
    motivo_conexao: str = Field(description="Explicação concisa de por que este conteúdo complementa a leitura")


class PerguntaFrequenteItem(BaseModel):
    """Item de FAQ didático para blocos explicativos."""
    pergunta: str = Field(description="Pergunta direta e comum do leitor")
    resposta: str = Field(description="Resposta clara, factual e sem jargões opacos")


# ============================================================================
# 2. SCHEMAS INTERNOS DE EVENTOS, COBERTURAS E EVIDÊNCIAS (SEÇÃO 4 V2.2)
# ============================================================================

class CoberturaVeiculoItem(BaseModel):
    documento_id: int
    veiculo_nome: str
    pais_veiculo: str
    fonte_tipo: FonteTipoLiteral = "veiculo_imprensa"
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
    paises_envolvidos: List[str] = Field(default_factory=list)
    urgencia_score: int = Field(ge=0, le=100)
    relevancia_score: int = Field(ge=0, le=100)
    nivel_confianca: NivelConfiancaLiteral = "alta"
    horas_em_destaque: int = Field(ge=2, le=24, default=6)
    sintese_com_ressalvas: str
    coberturas: List[CoberturaVeiculoItem] = Field(default_factory=list)
    evidencias: List[EvidenciaItem] = Field(default_factory=list)


# ============================================================================
# 3. CONTRATOS LIMPOS ENTREGUES AO FRONTEND PÚBLICO (SEÇÃO 4 V2.2)
# ============================================================================

class CoberturaPublica(BaseModel):
    veiculo_nome: str
    pais_veiculo: str
    fonte_tipo: FonteTipoLiteral = "veiculo_imprensa"
    eh_fallback_oficial: bool = False
    manchete_original: Optional[str] = None  # Preenchido apenas se exibicao_permitida == 'manchete_sintese_e_link'
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
    coberturas_destaque: List[CoberturaPublica] = Field(default_factory=list)
    total_coberturas_imprensa: int = 0
    total_fontes_primarias: int = 0
    tem_contexto_disponivel: bool = False


class EvidenciaResolvidaPublica(BaseModel):
    afirmacao_publicada: str
    parafrase_suporte: str
    fonte_nome: str
    fonte_tipo: str
    publicado_em: Optional[str] = None
    consultado_em: str
    url_original: str


class PainelVerificacaoEvento(BaseModel):
    slug: str
    afirmacoes_verificadas: List[EvidenciaResolvidaPublica] = Field(default_factory=list)
    coberturas_imprensa: List[CoberturaPublica] = Field(default_factory=list)
    documentos_oficiais: List[CoberturaPublica] = Field(default_factory=list)
    historico_publico_alteracoes: List[str] = Field(default_factory=list)


# ============================================================================
# 4. SCHEMAS DE PULSO (30M), "ENTENDA O ASSUNTO", INTERFACE, COLUNAS E AUDITORIA
# ============================================================================

class NoticiaQuenteItem(BaseModel):
    """Item individual do pipeline de pulso rápido (30m — gemini-2.5-flash)."""
    slug: str = Field(
        description="Identificador amigável para URL/Cache (ex: bcb-mantem-selic-impacto-cambio)"
    )
    titulo_curto: str = Field(
        max_length=160,
        description="Manchete curta, neutra e direta para o card/barra de notícias quentes"
    )
    resumo_pulso: str = Field(
        description="Síntese própria e atribuída em 2 a 3 frases, com ressalvas integradas se preliminar"
    )
    impacto_pratico: Optional[str] = Field(
        default=None,
        description="Consequência direta para cidadãos, viajantes, câmbio ou fronteiras"
    )
    categoria: CategoriaAtlas = Field(
        default="Geopolitica_Relacoes",
        description="Editoria temática do Atlas"
    )
    paises_envolvidos: List[str] = Field(
        default_factory=list,
        description="Códigos ISO-2 ou nomes dos países envolvidos (ex: ['BR', 'US'])"
    )
    urgencia_score: int = Field(
        ge=0, le=100,
        description="Nota de 0 a 100 medindo a urgência factual imediata"
    )
    relevancia_score: int = Field(
        ge=0, le=100,
        description="Nota de 0 a 100 medindo a relevância editorial para o público do portal"
    )
    nivel_confianca: NivelConfiancaLiteral = Field(
        default="alta",
        description="Grau de confirmação das evidências ('alta', 'media' ou 'preliminar')"
    )
    ttl_horas: int = Field(
        ge=1, le=168, default=6,
        description="Tempo de validade em horas para cálculo de expires_at em ai_noticias_quentes"
    )
    horas_em_destaque: int = Field(
        ge=1, le=24, default=6,
        description="Tempo sugerido de permanência em destaque na vitrine (em horas)"
    )
    veiculos_origem: List[str] = Field(
        default_factory=list,
        description="Nomes dos veículos de imprensa ou fontes primárias que reportaram o fato"
    )
    fontes_urls: List[str] = Field(
        default_factory=list,
        description="URLs canônicas originais das fontes consultadas"
    )
    palavras_chave: List[str] = Field(
        default_factory=list,
        description="Termos de busca e entidades centrais para impulsionar a pesquisa contextual"
    )
    links_internos_relacionados: List[LinkAcervoInterno] = Field(
        default_factory=list,
        description="Links internos validados contra banco de dados ou sitemap.xml"
    )


class PayloadNoticiasQuentes(BaseModel):
    """Lote estruturado gerado pelo pipeline de pulso de 30 minutos."""
    batch_id: str = Field(
        description="Identificador único da execução no formato YYYYMMDD-HHMM"
    )
    gerado_em: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat(),
        description="Timestamp ISO-8601 da geração do lote"
    )
    model_id: str = Field(
        default="gemini-2.5-flash",
        description="Modelo Gemini responsável pela extração de pulso"
    )
    noticias_quentes: List[NoticiaQuenteItem] = Field(
        default_factory=list,
        description="Lista ranqueada de notícias quentes da janela atual"
    )
    eventos_comparados: List[EventoComparado] = Field(
        default_factory=list,
        description="Eventos agrupados com comparação entre veículos e fontes primárias"
    )


class BlocoEntendaOAssunto(BaseModel):
    """Bloco explicativo e contextual ('Entenda o Assunto' / 'Entenda o Contexto')."""
    slug: str = Field(
        description="Slug identificador do tópico explicativo (ex: entenda-acordo-mercosul-ue)"
    )
    titulo_assunto: str = Field(
        max_length=220,
        description="Título didático e direto do assunto"
    )
    pergunta_central: str = Field(
        max_length=255,
        description="Pergunta central respondida pelo bloco explicativo"
    )
    resumo_executivo: str = Field(
        description="Explicação objetiva em 2 a 3 frases sobre o que está acontecendo"
    )
    contexto_historico: str = Field(
        description="Contextualização histórica, geopolítica ou econômica sem jargões complexos"
    )
    categoria: CategoriaAtlas = Field(
        default="Geopolitica_Relacoes",
        description="Categoria principal do Atlas"
    )
    paises_relacionados: List[str] = Field(
        default_factory=list,
        description="Países diretamente ligados ao tema"
    )
    tags: List[str] = Field(
        default_factory=list,
        description="Tags semânticas para indexação e busca"
    )
    impactos_praticos: List[ImpactoPublico] = Field(
        default_factory=list,
        description="Impactos práticos segmentados por público"
    )
    perguntas_frequentes: List[PerguntaFrequenteItem] = Field(
        default_factory=list,
        description="Perguntas e respostas rápidas para aprofundamento progressivo"
    )
    fontes_referencia: List[str] = Field(
        default_factory=list,
        description="Fontes primárias, instituições e veículos que fundamentam a explicação"
    )
    links_acervo_interno: List[LinkAcervoInterno] = Field(
        default_factory=list,
        description="Links internos estritamente validados contra o banco/sitemap"
    )
    relevancia_score: int = Field(
        ge=0, le=100, default=85,
        description="Relevância do bloco para priorização na interface"
    )


class InteligenciaInterfaceSite(BaseModel):
    """Contrato consolidado para alimentar a interface do site (Home, Vitrine, Busca e Contexto)."""
    batch_id: str = Field(
        description="Identificador do lote de atualização"
    )
    atualizado_em: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat(),
        description="Horário da última atualização"
    )
    identificacao_editorial: str = Field(
        default="Síntese Rodando o Mundo",
        description="Selo editorial exibido na interface pública"
    )
    noticias_quentes: List[NoticiaQuenteItem] = Field(
        default_factory=list,
        description="Destaques imediatos do pipeline de pulso (30m)"
    )
    eventos_principais: List[EventoPaginaPrincipal] = Field(
        default_factory=list,
        description="Eventos comparados da Camada 2 com isolamento de fontes primárias"
    )
    blocos_entenda_o_assunto: List[BlocoEntendaOAssunto] = Field(
        default_factory=list,
        description="Cards explicativos de contexto disponíveis para leitura sob demanda"
    )
    termos_busca_em_alta: List[str] = Field(
        default_factory=list,
        description="Sugestões dinâmicas de assuntos do momento para a barra de pesquisa"
    )
    paises_em_foco: List[str] = Field(
        default_factory=list,
        description="Países em evidência no ciclo atual para destaque no Atlas"
    )


# ============================================================================
# 5. SCHEMAS DO PIPELINE EDITORIAL SEQUENCIAL (gemini-2.5-pro)
#    Pesquisador Factual -> Advogado do Diabo -> Colunista Nerd -> Auditor
# ============================================================================

class DossiePesquisaFactual(BaseModel):
    """Saída da Etapa 1 (Prompt 1 — Pesquisador Factual)."""
    tema_central: str = Field(description="Tema principal selecionado para análise aprofundada")
    slug_sugerido: str = Field(description="Slug amigável sugerido para o estudo/coluna")
    categoria: CategoriaAtlas = Field(default="Geopolitica_Relacoes", description="Editoria principal do Atlas")
    paises_envolvidos: List[str] = Field(default_factory=list, description="Países diretamente envolvidos")
    cronologia_fatos: List[str] = Field(
        default_factory=list,
        description="Sequência cronológica objetiva dos fatos verificados"
    )
    evidencias_verificadas: List[EvidenciaItem] = Field(
        default_factory=list,
        description="Afirmações factuais, dados numéricos, citações e pontos incertos com fonte atribuída"
    )
    fontes_primarias_identificadas: List[str] = Field(
        default_factory=list,
        description="Órgãos oficiais, tribunais, bancos centrais ou organismos multilaterais consultados"
    )
    coberturas_imprensa_identificadas: List[str] = Field(
        default_factory=list,
        description="Resumo de como diferentes veículos nacionais/internacionais reportaram o fato"
    )
    dados_numericos_chave: List[str] = Field(
        default_factory=list,
        description="Cifras, percentuais, datas e estatísticas confirmadas pelas fontes"
    )
    pontos_incertos_ou_preliminares: List[str] = Field(
        default_factory=list,
        description="Aspectos ainda em aberto, não confirmados ou sujeitos a desdobramentos"
    )
    artigos_acervo_candidatos: List[LinkAcervoInterno] = Field(
        default_factory=list,
        description="Artigos existentes do acervo real do portal que têm conexão direta com o tema"
    )


class ParecerAdvogadoDiabo(BaseModel):
    """Saída da Etapa 2 (Prompt 2 — Advogado do Diabo)."""
    tese_inicial_questionada: str = Field(
        description="Síntese da narrativa dominante submetida a escrutínio crítico"
    )
    vieses_detectados_nas_fontes: List[str] = Field(
        default_factory=list,
        description="Possíveis vieses políticos, geográficos, econômicos ou retóricos nas fontes"
    )
    riscos_falsa_simetria: List[str] = Field(
        default_factory=list,
        description="Alertas para evitar equivalência artificial entre fatos documentados e versões sem lastro"
    )
    contra_argumentos_e_nuances: List[str] = Field(
        default_factory=list,
        description="Fatores estruturais, precedentes históricos e nuances que complexificam a análise"
    )
    perguntas_nao_respondidas: List[str] = Field(
        default_factory=list,
        description="Lacunas de informação que permanecem abertas até o momento"
    )
    ressalvas_obrigatorias_no_texto: List[str] = Field(
        default_factory=list,
        description="Ressalvas que o Colunista Nerd DEVE integrar diretamente nos parágrafos da coluna"
    )
    angulos_ignorados_pela_cobertura_comum: List[str] = Field(
        default_factory=list,
        description="Impactos práticos de segunda ordem (mobilidade, câmbio, comércio, cidadãos) pouco explorados"
    )


class ColunaEditorial(BaseModel):
    """Saída da Etapa 3 (Prompt 3 — Colunista Nerd): Coluna analítica aprofundada + Entenda o Assunto."""
    slug: str = Field(
        description="Slug amigável para URL da coluna editorial"
    )
    titulo: str = Field(
        max_length=255,
        description="Título jornalístico e analítico da coluna"
    )
    subtitulo: str = Field(
        description="Linha fina sintetizando a tese e os desdobramentos práticos"
    )
    tese_central: str = Field(
        description="Argumento central proporcional às evidências verificadas, sem falsa simetria"
    )
    corpo_markdown: str = Field(
        description="Texto analítico completo em Markdown, com ressalvas integradas e atribuição clara"
    )
    resumo_seo: str = Field(
        max_length=320,
        description="Descrição curta otimizada para SEO e compartilhamento"
    )
    categoria: CategoriaAtlas = Field(
        default="Geopolitica_Relacoes",
        description="Editoria principal da coluna"
    )
    paises_abordados: List[str] = Field(
        default_factory=list,
        description="Países analisados no texto"
    )
    tags: List[str] = Field(
        default_factory=list,
        description="Palavras-chave e tags temáticas"
    )
    tempo_leitura_min: int = Field(
        ge=1, le=60, default=5,
        description="Tempo estimado de leitura em minutos"
    )
    impactos_praticos: List[ImpactoPublico] = Field(
        default_factory=list,
        description="Consequências práticas extraídas da análise"
    )
    fontes_citadas: List[str] = Field(
        default_factory=list,
        description="Lista de fontes primárias, documentos oficiais e veículos referenciados"
    )
    artigos_existentes_para_linkar: List[LinkAcervoInterno] = Field(
        default_factory=list,
        description="Links internos do acervo real do portal a serem validados em Python antes do LLM Auditor"
    )
    links_acervo_interno: List[LinkAcervoInterno] = Field(
        default_factory=list,
        description="Links internos validados contra a tabela conteudos / ai_eventos / sitemap.xml"
    )
    entenda_o_assunto: Optional[BlocoEntendaOAssunto] = Field(
        default=None,
        description="Bloco didático 'Entenda o Assunto' / 'Entenda o Contexto' para atualização de ai_entenda_o_assunto"
    )
    model_id: str = Field(
        default="gemini-2.5-pro",
        description="Modelo utilizado na geração editorial"
    )

    @model_validator(mode="after")
    def _sincronizar_links_e_entenda(self) -> "ColunaEditorial":
        if self.artigos_existentes_para_linkar and not self.links_acervo_interno:
            self.links_acervo_interno = list(self.artigos_existentes_para_linkar)
        elif self.links_acervo_interno and not self.artigos_existentes_para_linkar:
            self.artigos_existentes_para_linkar = list(self.links_acervo_interno)
        return self


class ResultadoAuditoria(BaseModel):
    """Saída da Etapa 4 (Prompt 4 — Auditor / Fact-Checker): Auditoria de isenção, fatos e URLs."""
    aprovado: bool = Field(
        description="True se o conteúdo passou em todas as verificações obrigatórias e nota_isencao >= 85"
    )
    nota_isencao: int = Field(
        ge=0, le=100, default=90,
        description="Nota de 0 a 100 medindo isenção editorial, proporcionalidade factual e ausência de viés (mínimo 85)"
    )
    score_qualidade: int = Field(
        ge=0, le=100, default=90,
        description="Pontuação global de conformidade técnica e editorial de 0 a 100"
    )
    problemas_encontrados: List[str] = Field(
        default_factory=list,
        description="Lista de problemas factuais, de isenção, falta de ressalvas ou URLs inválidas para reescrita pelo Colunista"
    )
    urls_internas_validadas: List[str] = Field(
        default_factory=list,
        description="URLs internas confirmadas no banco de dados ou no sitemap.xml oficial"
    )
    urls_internas_invalidas_removidas: List[str] = Field(
        default_factory=list,
        description="URLs internas descartadas por não existirem no banco ou sitemap (prevenção de 404)"
    )
    fontes_primarias_isoladas_corretamente: bool = Field(
        default=True,
        description="Confirma se fontes governamentais/oficiais respeitaram a regra de isolamento nos destaques"
    )
    ressalvas_integradas_presentes: bool = Field(
        default=True,
        description="Confirma se pontos preliminares ou incertos estão explícitos no texto"
    )
    erros_criticos: List[str] = Field(
        default_factory=list,
        description="Erros impeditivos detectados na validação"
    )
    avisos_editoriais: List[str] = Field(
        default_factory=list,
        description="Observações ou sugestões de melhoria para o revisor humano"
    )
    auditado_em: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat(),
        description="Timestamp ISO-8601 da auditoria"
    )

    @model_validator(mode="after")
    def _sincronizar_campos_auditoria(self) -> "ResultadoAuditoria":
        if "nota_isencao" in self.model_fields_set and "score_qualidade" not in self.model_fields_set:
            self.score_qualidade = self.nota_isencao
        elif "score_qualidade" in self.model_fields_set and "nota_isencao" not in self.model_fields_set:
            self.nota_isencao = self.score_qualidade

        if self.problemas_encontrados and not self.erros_criticos:
            self.erros_criticos = list(self.problemas_encontrados)
        elif self.erros_criticos and not self.problemas_encontrados:
            self.problemas_encontrados = list(self.erros_criticos)
        return self
