"""Contrato de dados único do Agente de Curadoria (compartilhado por agente e API).

Qualquer mudança aqui DEVE ser refletida em:
  - curadoria/db/migrations/001_init.sql
  - .agents/contracts/SUG-CURADORIA-IA.md
"""
from typing import Dict, List, Literal

from pydantic import BaseModel, Field

CategoriaType = Literal[
    "Politica",
    "Economia",
    "Cultura",
    "Eleicoes",
    "Geopolitica_Radar",
    "Resumo_Ultimas",
]
StatusType = Literal["novo", "em_alta", "atualizacao"]
FormatoType = Literal[
    "Analise Geopolitica",
    "Guia Explicativo",
    "Comparativo Internacional",
    "Radar de Impacto",
]

MAPA_ROTAS_EDITORIA: Dict[str, str] = {
    "Politica": "/politica",
    "Economia": "/economia",
    "Cultura": "/cultura",
    "Eleicoes": "/eleicoes",
    "Geopolitica_Radar": "/radar",
    "Resumo_Ultimas": "/ultimas-noticias",
}


class PautaSugerida(BaseModel):
    titulo_seo: str = Field(
        description="Título otimizado para cliques e Google (ex: 'Como a decisão de juros nos EUA afeta o dólar e a inflação no Brasil')"
    )
    angulo_editorial: str = Field(
        description="Resumo em 2 frases da abordagem analítica e apartidária que a cobertura do Rodando o Mundo deve ter"
    )
    formato_ideal: FormatoType = Field(
        description="Melhor formato editorial para explicar o contexto e os impactos ao leitor"
    )


class InsightItem(BaseModel):
    slug: str = Field(description="Identificador amigável para URL/Cache (ex: corte-juros-fed-impacto-dolar-brasil)")
    titulo_tema: str = Field(description="Nome claro, direto e conciso do tópico jornalístico/geopolítico")
    status: StatusType = Field(
        description="'novo' para assunto inédito, 'em_alta' para pico de busca, 'atualizacao' se já estava no histórico mas teve fato novo."
    )
    categoria_primaria: CategoriaType = Field(description="A editoria principal do portal relacionada ao fato")
    categorias_cruzadas: List[CategoriaType] = Field(
        default_factory=list,
        description="Outras editorias do site afetadas indiretamente por este evento",
    )
    relevancia_score: int = Field(ge=0, le=100, description="Nota de 0 a 100 definindo o peso na vitrine do site")
    ttl_horas: int = Field(ge=1, le=720, description="Tempo de validade sugerido em horas para manter o tema em destaque")
    palavras_chave_busca: List[str] = Field(
        min_length=4,
        max_length=8,
        description="Termos exatos, sinônimos e variações coloquiais para impulsionar o motor de busca interno",
    )
    gatilho_vitrine: str = Field(
        description="Diretriz imperativa curta para o algoritmo selecionar artigos e hub temático relacionados"
    )
    sintese_nerd: str = Field(
        description="Explicação densa em 2 frases conectando causa macro (política/geopolítica/econômica) e consequência prática para o leitor brasileiro"
    )
    sugestao_pauta_gap: PautaSugerida = Field(
        description="Sugestão de artigo/explicação inédita caso o portal ainda não tenha cobertura suficiente sobre o tema"
    )


class CuradoriaPayload(BaseModel):
    batch_id: str = Field(description="Identificador único da execução no formato YYYYMMDD-HHMM")
    insights: List[InsightItem] = Field(
        description="Lista ranqueada do maior para o menor score dos melhores insights extraídos"
    )

