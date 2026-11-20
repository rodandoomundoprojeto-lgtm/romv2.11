"""Testes unitários para classificação e normalização de categoria no src/analyst.py."""
import json

from src.analyst import (
    _classificar_categoria_heuristica,
    _normalizar_categoria,
    _parse_resposta_analise,
)


def test_parse_resposta_analise_canal_top10_geopolitica():
    """Vídeo de geopolítica e defesa do Canal Top 10 deve ser classificado como geopolitica."""
    item = {
        "item_id": "yt-top10-guerra",
        "categoria": "dinamica",
        "fonte_nome": "Canal Top 10",
        "fonte_url": "https://www.youtube.com/shorts/_XEGvS6qf-c",
        "data_publicacao": "2026-11-19T23:00:09+00:00",
        "texto_conteudo": "Congresso dos EUA pode votar para encerrar guerra contra o Irã e cessar conflitos no Oriente Médio.",
    }
    raw = json.dumps({
        "duplicado": False,
        "categoria": "geopolitica",
        "titulo": "Congresso dos EUA pode encerrar guerra contra Irã",
        "resumo": "Senado debate resolução para interromper hostilidades militares no Golfo Pérsico.",
        "analise": "A medida impacta alianças no Oriente Médio e a projeção de defesa americana.",
    })
    res = _parse_resposta_analise(raw, item)
    assert res is not None
    assert res["categoria"] == "geopolitica"
    assert res["titulo"] == "Congresso dos EUA pode encerrar guerra contra Irã"


def test_parse_resposta_analise_canal_top10_cultura():
    """Vídeo de história humana / recorde do Canal Top 10 deve ser classificado como cultura."""
    item = {
        "item_id": "yt-top10-caminhada",
        "categoria": "dinamica",
        "fonte_nome": "Canal Top 10",
        "fonte_url": "https://www.youtube.com/watch?v=hdU3LF9X_es",
        "data_publicacao": "2026-11-19T22:00:00+00:00",
        "texto_conteudo": "Homem britânico percorre 28 anos a pé por 50 mil km para voltar à casa da mãe.",
    }
    raw = json.dumps({
        "duplicado": False,
        "categoria": "cultura",
        "titulo": "Homem britânico percorre 28 anos a pé para voltar à casa da mãe",
        "resumo": "Karl Bushby conclui jornada épica sem veículos motorizados.",
        "analise": "O feito histórico reflete determinação e os limites da resistência humana em viagens a pé.",
    })
    res = _parse_resposta_analise(raw, item)
    assert res is not None
    assert res["categoria"] == "cultura"


def test_fallback_heuristico_em_fonte_dinamica_sem_categoria_da_ia():
    """Se a IA retornar categoria inválida em fonte dinâmica, a heurística textual deve classificar por conteúdo."""
    item_geo = {
        "item_id": "yt-geo-heuristica",
        "categoria": "dinamica",
        "fonte_nome": "Canal Top 10",
        "texto_conteudo": "Tensão militar e novo míssil balístico na fronteira entre Ucrânia e Rússia com apoio da OTAN.",
    }
    raw_invalido = json.dumps({
        "duplicado": False,
        "categoria": "indefinido",
        "titulo": "Exercício militar e míssil na fronteira",
        "resumo": "Tropas realizam disparos na fronteira leste.",
        "analise": "Impacto na segurança regional.",
    })
    res_geo = _parse_resposta_analise(raw_invalido, item_geo)
    assert res_geo is not None
    assert res_geo["categoria"] == "geopolitica"

    item_cultura = {
        "item_id": "yt-cultura-heuristica",
        "categoria": "dinamica",
        "fonte_nome": "Canal Top 10",
        "texto_conteudo": "Expedição e sobrevivência em jornada de 20 anos a pé pela selva e montanhas.",
    }
    raw_invalido_cultura = json.dumps({
        "duplicado": False,
        "categoria": "",
        "titulo": "A incrível caminhada e aventura do viajante",
        "resumo": "Relato de expedição de sobrevivência.",
        "analise": "Inspiração para viagens e explorações.",
    })
    res_cult = _parse_resposta_analise(raw_invalido_cultura, item_cultura)
    assert res_cult is not None
    assert res_cult["categoria"] == "cultura"


def test_classificar_categoria_heuristica_direto():
    assert _classificar_categoria_heuristica("Alta da taxa Selic e inflação pelo Banco Central", "geral") == "economia"
    assert _classificar_categoria_heuristica("Votação da PEC no Senado e decisão de ministros do STF", "geral") == "politica"
    assert _classificar_categoria_heuristica("Exército anuncia míssil nuclear e alerta OTAN", "geral") == "geopolitica"
    assert _classificar_categoria_heuristica("Viagem e expedição de sobrevivência a pé", "geral") == "cultura"
    assert _classificar_categoria_heuristica("Assunto genérico sem palavras conhecidas", "geral") == "geral"


def test_normalizar_categoria_acentos_sinonimos_e_fallback():
    assert _normalizar_categoria("Geopolítica", "geral") == "geopolitica"
    assert _normalizar_categoria("Política", "geral") == "politica"
    assert _normalizar_categoria("Sociedade", "geopolitica") == "cultura"
    assert _normalizar_categoria("Finanças", "politica") == "economia"
    assert _normalizar_categoria("categoria_inexistente", "cultura") == "cultura"
    assert _normalizar_categoria("", "") == "geral"
