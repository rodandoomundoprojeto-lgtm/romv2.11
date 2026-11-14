"""Testes do contrato de dados (não exigem rede, Gemini nem Postgres)."""
import pytest
from pydantic import ValidationError

from curadoria.agente.coletor import carregar_feeds_sources_json, limpar_html
from curadoria.agente.schemas import MAPA_ROTAS_EDITORIA, CuradoriaPayload

EXEMPLO_VALIDO = {
    "batch_id": "20261113-2330",
    "insights": [
        {
            "slug": "corte-juros-fed-impacto-dolar-brasil",
            "titulo_tema": "Decisão de juros nos EUA pressiona câmbio e mercados emergentes",
            "status": "em_alta",
            "categoria_primaria": "Economia",
            "categorias_cruzadas": ["Politica", "Geopolitica_Radar"],
            "relevancia_score": 92,
            "ttl_horas": 72,
            "palavras_chave_busca": ["juros eua", "fed", "dólar", "economia brasil"],
            "gatilho_vitrine": "Destacar cobertura econômica sobre câmbio e juros",
            "sintese_nerd": "A manutenção dos juros pelo Federal Reserve altera o fluxo cambial para emergentes e impacta a Selic no Brasil.",
            "sugestao_pauta_gap": {
                "titulo_seo": "Como a decisão do Fed sobre juros nos EUA afeta o dólar e a Selic no Brasil",
                "angulo_editorial": "Comparar diferencial de juros Brasil-EUA e explicar o impacto na inflação doméstica.",
                "formato_ideal": "Guia Explicativo",
            },
        }
    ],
}


def test_payload_valido():
    p = CuradoriaPayload.model_validate(EXEMPLO_VALIDO)
    assert p.insights[0].relevancia_score == 92
    assert MAPA_ROTAS_EDITORIA[p.insights[0].categoria_primaria] == "/economia"


@pytest.mark.parametrize("campo,valor", [
    ("relevancia_score", 101),
    ("ttl_horas", 0),
    ("status", "velho"),
    ("categoria_primaria", "Destinos_Viagens"),
    ("palavras_chave_busca", ["a", "b"]),
])
def test_payload_invalido(campo, valor):
    dados = {**EXEMPLO_VALIDO, "insights": [{**EXEMPLO_VALIDO["insights"][0], campo: valor}]}
    with pytest.raises(ValidationError):
        CuradoriaPayload.model_validate(dados)


def test_limpar_html():
    assert limpar_html("<p>Olá   <b>mundo</b></p>") == "Olá mundo"
    assert limpar_html("") == ""


def test_carregar_feeds_sources_json():
    extras = carregar_feeds_sources_json()
    assert isinstance(extras, dict)
    assert "Politica" in extras or "Cultura" in extras

