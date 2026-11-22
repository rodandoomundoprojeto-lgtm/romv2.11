"""Testes da Curadoria Manual de Vídeos por Canal do YouTube RSS no Admin e Radar."""
import json
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import FastAPI
from fastapi.testclient import TestClient

import scripts.youtube_feeder as yt_feeder


class _FakeFeedResult:
    def __init__(self, entries):
        self.entries = entries


def _gerar_fake_entry(video_id: str, titulo: str, canal: str):
    return SimpleNamespace(
        title=titulo,
        link=f"https://www.youtube.com/watch?v={video_id}",
        yt_videoid=video_id,
        id=f"yt:video:{video_id}",
        published="2026-11-21T10:00:00+00:00",
        summary=f"Resumo da análise do vídeo {video_id}",
        media_description=f"Descrição detalhada do vídeo {video_id} pelo canal {canal}",
    )


class TestYouTubeCuradoriaManual(unittest.TestCase):
    def setUp(self):
        from api.routes_v2 import get_db, router, verificar_admin_token

        self.app = FastAPI()
        self.app.include_router(router)
        self.app.dependency_overrides[get_db] = lambda: None
        self.app.dependency_overrides[verificar_admin_token] = lambda: None
        self.client = TestClient(self.app)

    def test_listar_canais_cadastrados(self):
        """Testa listagem de canais cadastrados em Python e via API."""
        canais = yt_feeder.listar_canais_cadastrados_youtube()
        self.assertGreaterEqual(len(canais), 10)
        nomes = [c["nome"] for c in canais]
        self.assertIn("Prof Ricardo Marcílio", nomes)

        resp = self.client.get("/v2/admin/bot/youtube/canais")
        self.assertEqual(resp.status_code, 200)
        dados = resp.json()
        self.assertTrue(dados["ok"])
        self.assertGreaterEqual(dados["total"], 10)

    def test_buscar_canal_especifico_mock(self):
        """Testa busca de vídeos de um canal específico com tolerância a acentos."""
        fake_entries = [
            _gerar_fake_entry("VID11111111", "Vídeo de Teste 1", "Prof Ricardo Marcílio"),
            _gerar_fake_entry("VID22222222", "Vídeo de Teste 2", "Prof Ricardo Marcílio"),
        ]

        with patch("feedparser.parse", return_value=_FakeFeedResult(fake_entries)), patch(
            "scripts.youtube_feeder.coletar_canal_tempo_real_html", return_value=[]
        ):
            # Teste com termo sem acento e em minúsculas
            resultado = yt_feeder.buscar_videos_canal_especifico("ricardo marcilio", limite=2)
            self.assertTrue(resultado["ok"])
            self.assertEqual(resultado["canal"]["nome"], "Prof Ricardo Marcílio")
            self.assertEqual(len(resultado["videos"]), 2)
            self.assertEqual(resultado["videos"][0]["video_id"], "VID11111111")

            # Teste via endpoint HTTP
            resp = self.client.get("/v2/admin/bot/youtube/buscar-canal?canal=Marcilio&limite=2")
            self.assertEqual(resp.status_code, 200)
            data_resp = resp.json()
            self.assertTrue(data_resp["ok"])
            self.assertEqual(len(data_resp["videos"]), 2)

    def test_aprovar_video_manual_e_deduplicacao(self):
        """Testa inserção e aprovação manual de vídeo no feed atomicamente."""
        with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as tf:
            temp_path = Path(tf.name)

        try:
            # Arquivo inicial vazio
            temp_path.write_text(json.dumps({"items": []}), encoding="utf-8")

            video_payload = {
                "video_id": "ABC99999999",
                "titulo": "Vídeo Manual Aprovado",
                "resumo": "Análise aprovada pelo editor",
                "canal": "Prof Ricardo Marcílio",
                "url": "https://www.youtube.com/watch?v=ABC99999999",
                "thumbnail": "https://i.ytimg.com/vi/ABC99999999/hqdefault.jpg",
                "data_publicacao": "2026-11-21T11:00:00+00:00",
                "categoria": "geopolitica",
                "paises_envolvidos": ["BR"],
            }

            res = yt_feeder.aprovar_video_manual_youtube(video_payload, target_path=temp_path)
            self.assertTrue(res["ok"])
            self.assertEqual(res["video"]["video_id"], "ABC99999999")
            self.assertTrue(res["video"]["aprovado_manualmente"])

            # Valida conteúdo no arquivo
            conteudo = json.loads(temp_path.read_text(encoding="utf-8"))
            self.assertEqual(len(conteudo["items"]), 1)
            self.assertEqual(conteudo["items"][0]["titulo"], "Vídeo Manual Aprovado")

            # Inserção duplicada deve substituir/atualizar mantendo 1 item
            res2 = yt_feeder.aprovar_video_manual_youtube(video_payload, target_path=temp_path)
            self.assertTrue(res2["ok"])
            conteudo2 = json.loads(temp_path.read_text(encoding="utf-8"))
            self.assertEqual(len(conteudo2["items"]), 1)
        finally:
            if temp_path.exists():
                temp_path.unlink()

    def test_endpoint_aprovar_video_api(self):
        """Testa endpoint POST /v2/admin/bot/youtube/aprovar."""
        with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as tf:
            temp_path = Path(tf.name)

        try:
            temp_path.write_text(json.dumps({"items": []}), encoding="utf-8")
            with patch("scripts.youtube_feeder.DEFAULT_OUT_PATH", temp_path):
                resp = self.client.post(
                    "/v2/admin/bot/youtube/aprovar",
                    json={
                        "video_id": "TESTXYZ1234",
                        "titulo": "Vídeo Teste API Aprovar",
                        "resumo": "Resumo teste",
                        "canal": "Canal Top 10",
                        "url": "https://www.youtube.com/watch?v=TESTXYZ1234",
                    },
                )
                self.assertEqual(resp.status_code, 200)
                data = resp.json()
                self.assertTrue(data["ok"])
                self.assertIn("Vídeo 'Vídeo Teste API Aprovar' aprovado", data["mensagem"])
        finally:
            if temp_path.exists():
                temp_path.unlink()

    def test_adicionar_fonte_e_coletar_para_radar(self):
        """Testa adição de fonte do YouTube com envio imediato dos vídeos para o Radar."""
        fake_entries = [
            _gerar_fake_entry("NOVO1111111", "Vídeo Novo do Canal", "Canal Novo YouTube"),
            _gerar_fake_entry("NOVO2222222", "Vídeo Novo 2 do Canal", "Canal Novo YouTube"),
        ]

        with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as tf:
            temp_path = Path(tf.name)

        try:
            temp_path.write_text(json.dumps({"items": []}), encoding="utf-8")
            with patch("feedparser.parse", return_value=_FakeFeedResult(fake_entries)):
                res = yt_feeder.adicionar_fonte_e_coletar_para_radar(
                    nome="Canal Novo YouTube",
                    id_ou_url="UCnovocanal1234567890123",
                    categoria="geopolitica",
                    max_videos=2,
                    out_path=temp_path,
                )
                self.assertTrue(res["ok"])
                self.assertEqual(res["canal"], "Canal Novo YouTube")
                self.assertEqual(res["videos_adicionados"], 2)

                conteudo = json.loads(temp_path.read_text(encoding="utf-8"))
                self.assertEqual(len(conteudo["items"]), 2)
                self.assertEqual(conteudo["items"][0]["video_id"], "NOVO1111111")
        finally:
            if temp_path.exists():
                temp_path.unlink()


if __name__ == "__main__":
    unittest.main()
