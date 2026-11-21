#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Testes para a notificação de assuntos/tópicos aguardando aprovação no Admin (/admin).

Cobertura:
  - `src.notifier.notificar_aprovacao_admin_discord` — mensagem no Discord com título,
    breve descrição, destino da aprovação, origem da pesquisa, horário de chegada no
    banco, data de publicação das fontes e link para o Rodando o Mundo.
  - `api.routes_v2._enfileirar_itens_ddg_eventos` — alerta só quando o evento é novo,
    com os metadados do evento.
  - `redacao_v2.pulso_noticias_quentes.executar_upsert_noticias_quentes` — alerta só
    para notícias quentes novas que ficam aguardando revisão.
"""
import unittest
from datetime import datetime, timezone
from unittest import mock

from src import notifier
from api import routes_v2
from redacao_v2 import pulso_noticias_quentes as pulso_nq
from redacao_v2.schemas import NoticiaQuenteItem, PayloadNoticiasQuentes


class _FakeCursor:
    """Fake psycopg cursor para testar detecção de eventos novos."""

    def __init__(self, eventos_existentes=()):
        self.eventos = set(eventos_existentes)
        self._sql = ""
        self._params = ()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def execute(self, sql, params=None):
        self._sql = sql
        self._params = params or ()

    def fetchone(self):
        sql = (self._sql or "").lstrip()
        if sql.startswith("SELECT 1 FROM ai_eventos WHERE slug"):
            return None if self._params[0] not in self.eventos else (1,)
        if sql.startswith("INSERT INTO ai_eventos"):
            return {"id": 101}
        return None


class _FakeConn:
    def __init__(self, cursor):
        self._cursor = cursor

    def cursor(self):
        return self._cursor

    def commit(self):
        pass


class _FakePulsoCursor:
    """Fake cursor mínimo para o upsert de notícias quentes."""

    def __init__(self, slugs_existentes=()):
        self.slugs_existentes = set(slugs_existentes)
        self._row = None

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def execute(self, sql, params=None):
        norm = " ".join(str(sql).split()).lower()
        params = params or ()
        self._row = None

        if "insert into ai_noticias_quentes" in norm:
            slug = str((params or {}).get("slug", ""))
            self._row = {"inserido": slug not in self.slugs_existentes}
        elif norm.startswith("insert into ai_eventos"):
            self._row = {"id": 202}
        elif "select coalesce(max(versao), 0)" in norm:
            self._row = {"coalesce": 0}

    def fetchone(self):
        return self._row


def _pulso_payload(slug: str = "noticia-teste") -> PayloadNoticiasQuentes:
    return PayloadNoticiasQuentes(
        batch_id="20261120-2300",
        model_id="gemini-teste",
        noticias_quentes=[
            NoticiaQuenteItem(
                slug=slug,
                titulo_curto="Notícia quente de teste",
                resumo_pulso="Resumo da notícia quente de teste.",
                categoria="Economia_Comercio",
                urgencia_score=91,
                relevancia_score=87,
                veiculos_origem=["Veículo A", "Veículo B"],
                fontes_urls=["https://exemplo.com/noticia-quente"],
                data_publicacao="2026-11-20T20:15:00Z",
            )
        ],
    )


def _capturar_post(captured: dict):
    class _Resp:
        status_code = 204

    def fake_post(url, json=None, timeout=None):
        captured["url"] = url
        captured["json"] = json
        return _Resp()

    return fake_post


class TestAprovacaoAdminDiscord(unittest.TestCase):
    def test_notifica_envia_titulo_breve_e_link(self):
        captured = {}

        with mock.patch.object(notifier, "_is_test_environment", return_value=False), \
                mock.patch.object(notifier.requests, "post", side_effect=_capturar_post(captured)):
            ok = notifier.notificar_aprovacao_admin_discord("Título do assunto", "Breve descrição")

        self.assertTrue(ok)
        self.assertEqual(captured["url"], notifier.DISCORD_WEBHOOK_URL_APROVACAO_PADRAO)
        self.assertIn("Título do assunto", captured["json"]["content"])
        self.assertIn("Breve descrição", captured["json"]["content"])
        self.assertIn("https://www.rodandoomundo.com.br", captured["json"]["content"])

    def test_notifica_inclui_destino_origem_datas_e_fontes(self):
        captured = {}

        with mock.patch.object(notifier, "_is_test_environment", return_value=False), \
                mock.patch.object(notifier.requests, "post", side_effect=_capturar_post(captured)):
            ok = notifier.notificar_aprovacao_admin_discord(
                "Título do assunto",
                "Breve descrição",
                destino="Notícias Quentes + Radar · Eventos (ambos)",
                detalhes="urgência: 91/100 · relevância: 87/100",
                origem_pesquisa="Gemini (gemini-teste) · coleta de feeds de pulso (30 min)",
                categoria="Economia_Comercio",
                fontes=["Veículo A", "Veículo B"],
                url_fonte="https://exemplo.com/noticia-quente",
                chegou_em="2026-11-20T23:00:00Z",
                publicado_em="2026-11-20T20:15:00Z",
            )

        self.assertTrue(ok)
        conteudo = captured["json"]["content"]
        self.assertIn("Tipo / destino", conteudo)
        self.assertIn("Notícias Quentes + Radar · Eventos (ambos)", conteudo)
        self.assertIn("urgência: 91/100", conteudo)
        self.assertIn("Gemini (gemini-teste)", conteudo)
        self.assertIn("Veículo A · Veículo B", conteudo)
        self.assertIn("https://exemplo.com/noticia-quente", conteudo)
        self.assertIn("Chegou ao banco", conteudo)
        self.assertIn("Publicado pela fonte", conteudo)
        # Datas são enviadas como timestamps nativos do Discord.
        self.assertGreaterEqual(conteudo.count("<t:"), 2)

    def test_notifica_suspensa_em_ambiente_de_teste(self):
        with mock.patch.object(notifier, "_is_test_environment", return_value=True), \
                mock.patch.object(notifier.requests, "post") as fake_post:
            ok = notifier.notificar_aprovacao_admin_discord("Título", "Breve")
        self.assertFalse(ok)
        fake_post.assert_not_called()


class TestEnfileirarItensDdgEventosNotifica(unittest.TestCase):
    def test_notifica_apenas_eventos_novos(self):
        item = {
            "titulo": "Notícia de teste",
            "url": "https://exemplo.com/noticia-de-teste",
            "resumo": "Resumo da notícia de teste",
            "fonte": "Portal Teste",
            "categoriaRadar": "politica",
            "publicadoEm": "2026-11-20T18:00:00Z",
        }
        slug = routes_v2._gerar_slug_ddg_deterministico(item["titulo"], item["url"])

        conn_novo = _FakeConn(_FakeCursor(eventos_existentes=set()))
        with mock.patch.object(routes_v2, "notificar_aprovacao_admin_discord") as notify:
            routes_v2._enfileirar_itens_ddg_eventos(conn_novo, [item])
        notify.assert_called_once()
        args, kwargs = notify.call_args
        self.assertEqual(args[0], "Notícia de teste")
        self.assertEqual(args[1], "Resumo da notícia de teste")
        self.assertIn("Radar", kwargs.get("destino", ""))
        self.assertEqual(kwargs.get("url_fonte"), item["url"])
        self.assertEqual(kwargs.get("publicado_em"), item["publicadoEm"])
        self.assertIn("Portal Teste", kwargs.get("origem_pesquisa", ""))

        conn_existente = _FakeConn(_FakeCursor(eventos_existentes={slug}))
        with mock.patch.object(routes_v2, "notificar_aprovacao_admin_discord") as notify2:
            routes_v2._enfileirar_itens_ddg_eventos(conn_existente, [item])
        notify2.assert_not_called()


class TestPulsoNoticiasQuentesNotifica(unittest.TestCase):
    def test_notifica_noticia_quente_nova_pendente(self):
        conn = _FakeConn(_FakePulsoCursor(slugs_existentes=()))
        agora = datetime(2026, 11, 20, 23, 0, tzinfo=timezone.utc)

        with mock.patch.object(pulso_nq, "notificar_aprovacao_admin_discord") as notify:
            salvos = pulso_nq.executar_upsert_noticias_quentes(
                conn,
                _pulso_payload(),
                status_inicial="aguardando_revisao",
                agora=agora,
            )

        self.assertEqual(salvos, 1)
        notify.assert_called_once()
        kwargs = notify.call_args.kwargs
        self.assertIn("Notícias Quentes", kwargs["destino"])
        self.assertIn("Radar", kwargs["destino"])
        self.assertEqual(kwargs["chegou_em"], agora)
        self.assertEqual(kwargs["publicado_em"], "2026-11-20T20:15:00Z")
        self.assertEqual(kwargs["fontes"], ["Veículo A", "Veículo B"])

    def test_nao_notifica_quando_nao_precisa_de_aprovacao(self):
        conn = _FakeConn(_FakePulsoCursor(slugs_existentes=()))
        with mock.patch.object(pulso_nq, "notificar_aprovacao_admin_discord") as notify:
            pulso_nq.executar_upsert_noticias_quentes(
                conn,
                _pulso_payload(),
                status_inicial="ativo",
            )
        notify.assert_not_called()

    def test_nao_notifica_noticia_quente_ja_existente(self):
        conn = _FakeConn(_FakePulsoCursor(slugs_existentes={"noticia-teste"}))
        with mock.patch.object(pulso_nq, "notificar_aprovacao_admin_discord") as notify:
            pulso_nq.executar_upsert_noticias_quentes(
                conn,
                _pulso_payload(),
                status_inicial="aguardando_revisao",
            )
        notify.assert_not_called()


if __name__ == "__main__":
    unittest.main()
