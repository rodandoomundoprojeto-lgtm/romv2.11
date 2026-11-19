"""Testes do novo Bot Grok (xAI · X & Web Search) na Curadoria e Painel Admin."""
import os
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from curadoria.agente.coletor import coletar_noticias_grok_x


class TestBotGrokIntegracao(unittest.TestCase):
    def setUp(self):
        from api.routes_v2 import router, get_db, verificar_admin_token

        self.app = FastAPI()
        self.app.include_router(router)
        self.app.dependency_overrides[get_db] = lambda: None
        self.app.dependency_overrides[verificar_admin_token] = lambda: None
        self.client = TestClient(self.app)
        self.admin_headers = {"Authorization": "Bearer admin_test_token"}

    def test_coletar_noticias_grok_x(self):
        """Testa se a função de coleta lê corretamente o arquivo data/noticias_x.json."""
        itens = coletar_noticias_grok_x(limite=10)
        self.assertIsInstance(itens, list)
        if itens:
            primeiro = itens[0]
            self.assertEqual(primeiro["origem"], "Grok (xAI / X)")
            self.assertIn("titulo", primeiro)
            self.assertIn("link", primeiro)
            self.assertIn("resumo", primeiro)
            self.assertIn("pais", primeiro)

    def test_admin_bot_grok_status(self):
        """Testa o endpoint GET /v2/admin/bot/grok/status."""
        with patch.dict(os.environ, {"ADMIN_SECRET_TOKEN": "admin_test_token"}, clear=False):
            resp = self.client.get("/v2/admin/bot/grok/status", headers=self.admin_headers)
            self.assertEqual(resp.status_code, 200)
            data = resp.json()
            self.assertTrue(data.get("ok"))
            self.assertIn("chave_configurada", data)
            self.assertIn("modelo_configurado", data)
            self.assertIn("arquivo", data)
            self.assertIn("total_itens", data["arquivo"])

    def test_admin_bot_grok_executar_dry_run_mock(self):
        """Testa o disparo do Bot Grok em modo dry-run com mock."""
        with patch.dict(os.environ, {"ADMIN_SECRET_TOKEN": "admin_test_token"}, clear=False):
            resp = self.client.post(
                "/v2/admin/bot/grok/executar",
                headers=self.admin_headers,
                json={"dry_run": True, "force_mock": True},
            )
            self.assertEqual(resp.status_code, 200)
            data = resp.json()
            self.assertTrue(data.get("ok"))
            self.assertEqual(data.get("status"), "concluido")
            self.assertTrue(data.get("dry_run"))
            self.assertTrue(data.get("mock_utilizado"))
            self.assertGreaterEqual(data.get("total_itens", 0), 3)

    def test_admin_radar_feed_contem_grok(self):
        """Testa se a listagem do feed do Radar no admin integra itens do Grok."""
        with patch.dict(os.environ, {"ADMIN_SECRET_TOKEN": "admin_test_token"}, clear=False):
            resp = self.client.get("/v2/admin/radar/feed", headers=self.admin_headers)
            self.assertEqual(resp.status_code, 200)
            data = resp.json()
            self.assertTrue(data.get("ok"))
            self.assertIn("contadores", data)
            self.assertIn("grok_x", data["contadores"])
            # Se houver arquivo noticias_x.json, os cards devem possuir itens com origem grok_x
            if data["contadores"]["grok_x"] > 0:
                grok_cards = [c for c in data.get("cards", []) if c.get("origem") == "grok_x"]
                self.assertGreaterEqual(len(grok_cards), 1)
                self.assertTrue(grok_cards[0].get("origem_grok_x"))
