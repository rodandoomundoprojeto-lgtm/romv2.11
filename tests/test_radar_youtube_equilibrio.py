"""Testes unitários para equilíbrio de canais do YouTube no Pulso V2 e no Radar clássico."""
import json
from pathlib import Path
from types import SimpleNamespace

from redacao_v2.pulso_noticias_quentes import selecionar_lote_balanceado_pulso
from src.collector import get_youtube_content
from src.publisher import _mesclar_e_ordenar_feed, _selecionar_feed_diversificado


def test_sources_json_contem_cinco_canais_citados():
    sources_path = Path(__file__).resolve().parents[1] / "config" / "sources.json"
    sources = json.loads(sources_path.read_text(encoding="utf-8"))
    nomes = {s["nome"] for s in sources if s.get("tipo") == "youtube"}
    esperados = {
        "Professor HOC",
        "Planeta Novo",
        "Prof Ricardo Marcílio",
        "Prof. JeanGrafia | GabaritaGeo",
        "Canal Top 10",
    }
    assert esperados.issubset(nomes)


def test_selecionar_lote_balanceado_pulso_garante_youtube_sem_dominar():
    itens = []
    # 35 notícias RSS mais recentes (de 3 portais)
    for i in range(35):
        portal = f"Portal_{i % 3}"
        itens.append(
            {
                "fonte": portal,
                "tipo_fonte": "rss_feed",
                "titulo": f"Notícia urgente {i}",
                "url": f"https://exemplo.com/n/{i}",
                "canonical_url": f"https://exemplo.com/n/{i}",
                "published_at": f"2026-11-19T20:{59 - i:02d}:00+00:00",
            }
        )
    # 6 vídeos do YouTube publicados algumas horas antes
    canais = ["Professor HOC", "Planeta Novo", "Prof Ricardo Marcílio", "Prof. JeanGrafia | GabaritaGeo", "Canal Top 10", "Professor HOC"]
    for idx, canal in enumerate(canais):
        itens.append(
            {
                "fonte": canal,
                "tipo_fonte": "youtube_rss",
                "titulo": f"Análise {canal} #{idx}",
                "url": f"https://www.youtube.com/watch?v=vid{idx:08d}",
                "canonical_url": f"https://www.youtube.com/watch?v=vid{idx:08d}",
                "published_at": f"2026-11-19T14:{50 - idx:02d}:00+00:00",
            }
        )

    lote = selecionar_lote_balanceado_pulso(itens, limite=30, max_por_fonte=2, cota_youtube=5)
    assert len(lote) == 30
    yt_no_lote = [x for x in lote if x["tipo_fonte"] == "youtube_rss"]
    rss_no_lote = [x for x in lote if x["tipo_fonte"] == "rss_feed"]
    assert len(yt_no_lote) == 5
    assert len(rss_no_lote) == 25
    # Máximo 1 vídeo por canal na cota reservada
    assert len({x["fonte"] for x in yt_no_lote}) == 5


def test_get_youtube_content_fallback_nao_descarta_descricao_curta():
    entry = SimpleNamespace(title="Crise no Oriente Médio explicada", summary="")
    conteudo = get_youtube_content(entry, video_id="")
    assert "Crise no Oriente Médio explicada" in conteudo
    assert len(conteudo) >= 25


def test_selecionar_feed_diversificado_limita_portal_alto_volume():
    itens = []
    # 15 itens muito recentes de um mesmo portal
    for i in range(15):
        itens.append(
            {
                "titulo": f"Nota Poder360 {i}",
                "fonte_nome": "Poder360",
                "fonte_url": f"https://poder360.com.br/{i}",
                "data_publicacao": f"2026-11-19T22:{50 - i:02d}:00+00:00",
            }
        )
    # 5 vídeos do YouTube um pouco mais antigos
    for j, canal in enumerate(["Professor HOC", "Planeta Novo", "Canal Top 10", "Prof Ricardo Marcílio", "Prof. JeanGrafia | GabaritaGeo"]):
        itens.append(
            {
                "titulo": f"Vídeo {canal}",
                "fonte_nome": canal,
                "fonte_url": f"https://youtube.com/watch?v=abc{j}",
                "data_publicacao": f"2026-11-19T16:{30 - j:02d}:00+00:00",
            }
        )

    # Com max_items=10 e max_por_fonte=4, todos os 5 vídeos entram e o 10º slot é completado pelo fallback
    selecionados = _selecionar_feed_diversificado(itens, max_items=10, max_por_fonte=4)
    poder_count = sum(1 for x in selecionados if x["fonte_nome"] == "Poder360")
    yt_count = sum(1 for x in selecionados if x["fonte_nome"] != "Poder360")
    assert yt_count == 5
    assert poder_count == 5


def test_mesclar_e_ordenar_feed_preserva_youtube_com_rodizio():
    existing = [
        {
            "titulo": f"G1 {i}",
            "resumo": "r",
            "analise": "a",
            "categoria": "politica",
            "fonte_nome": "G1 Política",
            "fonte_url": f"https://g1.globo.com/{i}",
            "data_publicacao": f"2026-11-19T20:{50 - i:02d}:00+00:00",
        }
        for i in range(10)
    ]
    novos = [
        {
            "titulo": "Análise Planeta Novo sobre Oriente Médio",
            "resumo": "r",
            "analise": "a",
            "categoria": "geopolitica",
            "fonte_nome": "Planeta Novo",
            "fonte_url": "https://youtube.com/watch?v=xyz12345678",
            "data_publicacao": "2026-11-19T14:00:00+00:00",
        }
    ]
    trimmed, _ = _mesclar_e_ordenar_feed(existing, novos, max_items=8)
    fontes = [x["fonte_nome"] for x in trimmed]
    assert "Planeta Novo" in fontes
    assert fontes.count("G1 Política") <= 7
