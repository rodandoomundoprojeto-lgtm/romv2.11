"""Testes unitários e de integração do Bot de Vídeos do YouTube RSS no Painel Admin e Radar."""
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
        published="2026-11-21T02:00:00+00:00",
        summary=f"Resumo da análise do vídeo {video_id}",
        media_description=f"Descrição detalhada do vídeo {video_id} pelo canal {canal}",
    )


class TestBotYouTubeFeederIntegracao(unittest.TestCase):
    def setUp(self):
        from api.routes_v2 import get_db, router, verificar_admin_token

        self.app = FastAPI()
        self.app.include_router(router)
        self.app.dependency_overrides[get_db] = lambda: None
        self.app.dependency_overrides[verificar_admin_token] = lambda: None
        self.client = TestClient(self.app)

    def test_carregar_canais_youtube(self):
        """Testa se carrega canais de config/sources.json."""
        canais = yt_feeder.carregar_canais_youtube()
        self.assertGreaterEqual(len(canais), 5)
        nomes = [c.get("nome") for c in canais]
        self.assertIn("Professor HOC", nomes)

    def test_executar_bot_youtube_dry_run(self):
        """Testa execução do bot de vídeos com mock do feedparser."""
        fake_entries = [
            _gerar_fake_entry("vid00000001", "Guerra e Paz na Geopolítica", "Professor HOC"),
            _gerar_fake_entry("vid00000002", "Mudanças Climáticas e Acordo", "Canal Top 10"),
        ]
        with patch.object(yt_feeder.feedparser, "parse", return_value=_FakeFeedResult(fake_entries)):
            res = yt_feeder.executar_bot_youtube(max_por_canal=2, dry_run=True)
            self.assertTrue(res["ok"])
            self.assertEqual(res["status"], "concluido")
            self.assertTrue(res["dry_run"])
            self.assertGreaterEqual(res["total_itens"], 2)
            self.assertEqual(res["items"][0]["formato"], "video")
            self.assertEqual(res["items"][0]["origem"], "video")

    def test_admin_bot_youtube_status(self):
        """Testa GET /v2/admin/bot/youtube/status."""
        resp = self.client.get("/v2/admin/bot/youtube/status")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data["ok"])
        self.assertIn("canais_configurados", data)
        self.assertIn("arquivo", data)

    def test_admin_bot_youtube_executar(self):
        """Testa POST /v2/admin/bot/youtube/executar em dry-run."""
        fake_entries = [
            _gerar_fake_entry("vid00000003", "Análise Econômica Global", "Professor HOC"),
        ]
        with patch.object(yt_feeder.feedparser, "parse", return_value=_FakeFeedResult(fake_entries)):
            resp = self.client.post(
                "/v2/admin/bot/youtube/executar",
                json={"max_por_canal": 1, "dry_run": True},
            )
            self.assertEqual(resp.status_code, 200)
            data = resp.json()
            self.assertTrue(data["ok"])
            self.assertEqual(data["status"], "concluido")
            self.assertTrue(data["dry_run"])

    def test_admin_radar_feed_inclui_contador_video(self):
        """Testa se GET /v2/admin/radar/feed inclui contador de vídeos e suporta filtro de origem."""
        resp = self.client.get("/v2/admin/radar/feed")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data["ok"])
        self.assertIn("contadores", data)
        self.assertIn("video", data["contadores"])

        # Testar filtro por origem video
        resp_vid = self.client.get("/v2/admin/radar/feed?origem=video")
        self.assertEqual(resp_vid.status_code, 200)
        data_vid = resp_vid.json()
        self.assertTrue(data_vid["ok"])
        for card in data_vid["cards"]:
            eh_vid = card.get("origem") == "video" or card.get("formato") == "video" or card.get("origem_video")
            self.assertTrue(eh_vid)

    def test_limpar_descricao_youtube_e_analise(self):
        """Valida higienização de descrições promocionais/hashtags/CTAs e omissão de análise repetida."""
        res_kobori = yt_feeder.limpar_descricao_youtube(
            "O Novo Ciclo Brasil - 26/11 às 20h - Inscreva-se gratuitamente: "
            "Cortar gastos pode gerar uma recessão? Entrevista completa no canal @podcast3irmaos no YouTube! "
            "#ajustefiscal #lula #economia ---- -------- Envie sua pergunta e",
            titulo="Cortar gastos pode gerar uma recessão?",
            nome_canal="José Kobori",
        )
        self.assertEqual(
            res_kobori,
            "Análise e cobertura em vídeo publicada pelo canal José Kobori no YouTube.",
        )

        res_abordo = yt_feeder.limpar_descricao_youtube(
            "O PLANO PARA DESTRUIR MENDONÇA DEU ERRADO! JOGADA NO STF E PF! TUDO FOI REVELADO! PEGANDO FOGO HOJE!\n\n\n"
            "Seja membro deste canal e ganhe benefícios:\n\n\n"
            "Bem-vindo ao A Bordo Notícias, sua fonte diária de informações rápidas, precisas e análises "
            "aprofundadas sobre os principais acontecimentos do Brasil e do mundo. Aqui você",
            titulo="O PLANO PARA DESTRUIR MENDONÇA DEU ERRADO! JOGADA NO STF E PF! TUDO FOI REVELADO! PEGANDO FOGO HOJE!",
            nome_canal="A Bordo Notícias",
        )
        self.assertEqual(
            res_abordo,
            "Análise e cobertura em vídeo publicada pelo canal A Bordo Notícias no YouTube.",
        )

        res_ndbh = yt_feeder.limpar_descricao_youtube(
            "#Noticias",
            titulo="ACORDAMOS COM A BOMBA!! FBI PEGOU NO AEROPORTO!",
            nome_canal="Notícias Do Brasil Hoje",
        )
        self.assertEqual(
            res_ndbh,
            "Análise e cobertura em vídeo publicada pelo canal Notícias Do Brasil Hoje no YouTube.",
        )

        res_misto = yt_feeder.limpar_descricao_youtube(
            "Tenha acesso a NOMAD na YELLOW FRIDAY e ganhe até 5,5% de cashback!\n\nLink: https://nomad.com\n\n"
            "Guerra Rússia e Ucrânia se expande para além da fronteira entre os dois países e atinge o Báltico.",
            titulo="Guerra se expande",
            nome_canal="Prof Ricardo Marcílio",
        )
        self.assertIn("Guerra Rússia e Ucrânia se expande", res_misto)
        self.assertNotIn("NOMAD", res_misto)

        item_norm = yt_feeder._normalizar_item_video(
            video_id="TEST1234567",
            titulo="Teste Limpeza",
            resumo=res_misto,
            nome_canal="Prof Ricardo Marcílio",
            link="https://www.youtube.com/watch?v=TEST1234567",
            data_pub="2026-11-22T12:00:00+00:00",
        )
        self.assertEqual(item_norm["analise"], "")

    def test_limpar_descricao_sem_truncamento_abrupto(self):
        """Garante que descrições truncadas ou longas nunca terminem com reticências."""
        res_com_segunda_frase_cortada = yt_feeder.limpar_descricao_youtube(
            "Em entrevista ao programa Agenda Econômica, da TV Senado, a economista Monica de Bolle apontou "
            "um desafio estrutural urgente para o país: grande parte da nossa dívida pública segue indexada à "
            "Selic, em títulos pós-fixados\nNa prática, isso trava a coordenação entre as políticas fiscal e "
            "monetária e mantém...",
            titulo="Quais são os desafios do quarto governo de Lula? #shorts",
            nome_canal="TV Senado",
        )
        self.assertFalse(res_com_segunda_frase_cortada.endswith(("...", "…")))
        self.assertTrue(res_com_segunda_frase_cortada.endswith((".", "!", "?")))
        self.assertIn("Monica de Bolle", res_com_segunda_frase_cortada)

        res_frase_unica_cortada = yt_feeder.limpar_descricao_youtube(
            "Os Estados Unidos anunciaram novas tarifas sobre o açúcar que entra no país acima...",
            titulo="Trump mira a EMBRAER",
            nome_canal="Canal Teste",
        )
        self.assertFalse(res_frase_unica_cortada.endswith(("...", "…")))
        self.assertTrue(res_frase_unica_cortada.endswith((".", "!", "?")))


if __name__ == "__main__":
    unittest.main()
