"""Testes do Bot DuckDuckGo News (ddgs) na Curadoria e Painel Admin."""
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

import curadoria.agente.coletor as coletor_mod
import scripts.ddg_news_feeder as ddg_feeder


MOCK_DDG_RESULTS = [
    {
        "date": "2026-11-19T20:00:00+00:00",
        "title": "Banco Central avalia impacto do câmbio na inflação",
        "body": "Diretoria analisa trajetória dos juros e cenário externo.",
        "url": "https://exemplo.com.br/economia/bc-cambio",
        "image": "https://exemplo.com.br/img.jpg",
        "source": "Portal Exemplo",
    },
    {
        "date": "2026-11-19T19:30:00+00:00",
        "title": "Acordo comercial entra em nova fase de negociação",
        "body": "Representantes discutem tarifas e regras ambientais.",
        "url": "https://exemplo.com.br/mundo/acordo",
        "image": None,
        "source": "Agência Global",
    },
]


class _FakeDDGS:
    def news(self, query, region="br-pt", timelimit="d", max_results=6):
        return list(MOCK_DDG_RESULTS)


class TestBotDdgNewsIntegracao(unittest.TestCase):
    def setUp(self):
        from api.routes_v2 import get_db, router, verificar_admin_token

        self.app = FastAPI()
        self.app.include_router(router)
        self.app.dependency_overrides[get_db] = lambda: None
        self.app.dependency_overrides[verificar_admin_token] = lambda: None
        self.client = TestClient(self.app)

    def test_executar_coleta_ddg_e_coletor_curadoria(self):
        """Testa coleta com deduplicação e leitura pela curadoria."""
        with tempfile.TemporaryDirectory() as tmp:
            out_file = Path(tmp) / "noticias_ddg.json"
            with patch.object(ddg_feeder, "DDGS", _FakeDDGS):
                payload = ddg_feeder.executar_coleta_ddg(
                    query="Brasil economia",
                    max_results=5,
                    dry_run=False,
                    out_path=out_file,
                )
            self.assertEqual(payload["total"], 2)
            self.assertTrue(out_file.is_file())

            with patch.object(coletor_mod, "NOTICIAS_DDG_JSON_PATH", out_file):
                itens = coletor_mod.coletar_noticias_ddg_news(limite=10)
            self.assertEqual(len(itens), 2)
            self.assertEqual(itens[0]["origem"], "DuckDuckGo News (ddgs)")
            self.assertEqual(itens[0]["fonte"], "Portal Exemplo")

    def test_admin_bot_ddg_status(self):
        """Testa GET /v2/admin/bot/ddg/status."""
        resp = self.client.get("/v2/admin/bot/ddg/status")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data["ok"])
        self.assertIn("lib_disponivel", data)
        self.assertIn("arquivo", data)

    def test_admin_bot_ddg_executar_dry_run(self):
        """Testa POST /v2/admin/bot/ddg/executar em modo dry-run."""
        with patch.object(ddg_feeder, "DDGS", _FakeDDGS):
            resp = self.client.post(
                "/v2/admin/bot/ddg/executar",
                json={"query": "Brasil economia", "dry_run": True, "max_results": 4},
            )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data["ok"])
        self.assertEqual(data["status"], "concluido")
        self.assertTrue(data["dry_run"])
        self.assertEqual(data["total_itens"], 2)
        self.assertEqual(len(data["items"]), 2)

    def test_admin_radar_feed_contem_ddg_news(self):
        """Testa se GET /v2/admin/radar/feed inclui contador e cards ddg_news."""
        resp = self.client.get("/v2/admin/radar/feed")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data["ok"])
        self.assertIn("contadores", data)
        self.assertIn("ddg_news", data["contadores"])
