"""Testes para exclusão definitiva de fontes e prevenção de ressuscitação no Admin."""
import json
from pathlib import Path
from unittest.mock import MagicMock

from api.routes_v2 import (
    _obter_fontes_removidas_set,
    _registrar_fonte_removida,
    _desmarcar_fonte_removida,
    _remover_fonte_config_sources,
    _remover_conteudo_canal_excluido,
    admin_excluir_fonte,
    admin_listar_fontes,
)


def test_registrar_e_desmarcar_fonte_removida(tmp_path, monkeypatch):
    removidas_file = tmp_path / "fontes_removidas.json"
    monkeypatch.setattr("api.routes_v2.FONTES_REMOVIDAS_PATH", removidas_file)

    # 1. Registrar
    _registrar_fonte_removida("Canal Teste", "https://youtube.com/feeds/videos.xml?channel_id=UC123456789")
    assert removidas_file.is_file()

    urls, nomes = _obter_fontes_removidas_set()
    assert "https://youtube.com/feeds/videos.xml?channel_id=uc123456789" in urls
    assert "uc123456789" in urls
    assert "canal teste" in nomes

    # 2. Desmarcar
    _desmarcar_fonte_removida("Canal Teste", "https://youtube.com/feeds/videos.xml?channel_id=UC123456789")
    urls_apos, nomes_apos = _obter_fontes_removidas_set()
    assert "canal teste" not in nomes_apos


def test_remover_fonte_config_sources(tmp_path, monkeypatch):
    sources_file = tmp_path / "sources.json"
    dados_mock = [
        {"nome": "Fonte Manter", "tipo": "youtube", "id_ou_url": "UC_MANTER_123"},
        {"nome": "BR NOTÍCIAS", "tipo": "youtube", "id_ou_url": "UCazBTgMYUz6goZZJ7yhkNTw"},
    ]
    sources_file.write_text(json.dumps(dados_mock, indent=2), encoding="utf-8")
    monkeypatch.setattr("api.routes_v2.SOURCES_JSON_PATH", sources_file)

    removido = _remover_fonte_config_sources("BR NOTÍCIAS", "https://youtube.com/feeds/videos.xml?channel_id=UCazBTgMYUz6goZZJ7yhkNTw")
    assert removido is True

    atualizado = json.loads(sources_file.read_text(encoding="utf-8"))
    assert len(atualizado) == 1
    assert atualizado[0]["nome"] == "Fonte Manter"


def test_remover_conteudo_canal_excluido(tmp_path, monkeypatch):
    yt_file = tmp_path / "noticias_youtube.json"
    feed_file = tmp_path / "feed_output.json"

    yt_file.write_text(json.dumps({
        "ok": True,
        "items": [
            {"titulo": "Vídeo 1", "canal": "BR NOTÍCIAS"},
            {"titulo": "Vídeo 2", "canal": "Outro Canal"}
        ]
    }), encoding="utf-8")

    feed_file.write_text(json.dumps([
        {"titulo": "Notícia 1", "fonte_nome": "BR NOTÍCIAS"},
        {"titulo": "Notícia 2", "fonte_nome": "Outro Canal"}
    ]), encoding="utf-8")

    # Patch paths
    monkeypatch.setattr("api.routes_v2.NOTICIAS_YOUTUBE_JSON_PATH", yt_file)
    monkeypatch.setattr("api.routes_v2.FEED_OUTPUT_JSON_PATH", feed_file)

    _remover_conteudo_canal_excluido("BR NOTÍCIAS")

    yt_dados = json.loads(yt_file.read_text(encoding="utf-8"))
    assert len(yt_dados["items"]) == 1
    assert yt_dados["items"][0]["canal"] == "Outro Canal"

    feed_dados = json.loads(feed_file.read_text(encoding="utf-8"))
    assert len(feed_dados) == 1
    assert feed_dados[0]["fonte_nome"] == "Outro Canal"
