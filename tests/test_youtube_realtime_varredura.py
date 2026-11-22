"""Testes da varredura híbrida em tempo real (HTML + RSS) e extração de link direto de vídeos."""
import datetime
import json
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

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
        summary=f"Resumo detalhado RSS de {video_id}",
        media_description=f"Descrição detalhada RSS do vídeo {video_id} pelo canal {canal}",
    )


def _montar_html_canal_mock(video_id_novo: str, titulo_novo: str, tempo_rel: str, video_id_antigo: str, titulo_antigo: str):
    """Gera HTML simulado com ytInitialData contendo lockupViewModel."""
    yt_data = {
        "contents": {
            "twoColumnBrowseResultsRenderer": {
                "tabs": [
                    {
                        "tabRenderer": {
                            "content": {
                                "richGridRenderer": {
                                    "contents": [
                                        {
                                            "richItemRenderer": {
                                                "content": {
                                                    "lockupViewModel": {
                                                        "metadata": {
                                                            "lockupMetadataViewModel": {
                                                                "title": {"content": titulo_novo},
                                                                "metadata": {
                                                                    "contentMetadataViewModel": {
                                                                        "metadataRows": [
                                                                            {
                                                                                "metadataParts": [
                                                                                    {"text": {"content": "120 visualizações"}},
                                                                                    {"text": {"content": tempo_rel}},
                                                                                ]
                                                                            }
                                                                        ]
                                                                    }
                                                                },
                                                            }
                                                        },
                                                        "rendererContext": {
                                                            "commandContext": {
                                                                "onTap": {
                                                                    "innertubeCommand": {
                                                                        "commandMetadata": {
                                                                            "webCommandMetadata": {
                                                                                "url": f"/watch?v={video_id_novo}"
                                                                            }
                                                                        }
                                                                    }
                                                                }
                                                            }
                                                        },
                                                    }
                                                }
                                            }
                                        },
                                        {
                                            "richItemRenderer": {
                                                "content": {
                                                    "lockupViewModel": {
                                                        "metadata": {
                                                            "lockupMetadataViewModel": {
                                                                "title": {"content": titulo_antigo},
                                                                "metadata": {
                                                                    "contentMetadataViewModel": {
                                                                        "metadataRows": [
                                                                            {
                                                                                "metadataParts": [
                                                                                    {"text": {"content": "há 1 dia"}}
                                                                                ]
                                                                            }
                                                                        ]
                                                                    }
                                                                },
                                                            }
                                                        },
                                                        "rendererContext": {
                                                            "commandContext": {
                                                                "onTap": {
                                                                    "innertubeCommand": {
                                                                        "commandMetadata": {
                                                                            "webCommandMetadata": {
                                                                                "url": f"/watch?v={video_id_antigo}"
                                                                            }
                                                                        }
                                                                    }
                                                                }
                                                            }
                                                        },
                                                    }
                                                }
                                            }
                                        },
                                    ]
                                }
                            }
                        }
                    }
                ]
            }
        }
    }
    return f"<html><head></head><body><script>var ytInitialData = {json.dumps(yt_data)};</script></body></html>"


class TestYouTubeRealtimeVarredura(unittest.TestCase):
    def test_converter_tempo_relativo_para_iso(self):
        """Valida conversão de textos relativos do YouTube para ISO UTC."""
        agora = datetime.datetime.now(datetime.timezone.utc)
        iso_min = yt_feeder._converter_tempo_relativo_para_iso("há 5 minutos")
        dt_min = datetime.datetime.fromisoformat(iso_min)
        diff = (agora - dt_min).total_seconds()
        self.assertGreaterEqual(diff, 290)
        self.assertLessEqual(diff, 320)

        iso_horas = yt_feeder._converter_tempo_relativo_para_iso("2 hours ago")
        dt_horas = datetime.datetime.fromisoformat(iso_horas)
        diff_h = (agora - dt_horas).total_seconds()
        self.assertGreaterEqual(diff_h, 7180)
        self.assertLessEqual(diff_h, 7220)

    def test_varredura_hibrida_html_rss_prioriza_video_recem_lancado(self):
        """
        Garante que um vídeo lançado há minutos (presente no HTML /videos, ainda ausente no RSS)
        apareça no topo marcado com recem_lancado=True, enquanto vídeos já no RSS preservam o resumo rico.
        """
        html_mock = _montar_html_canal_mock(
            video_id_novo="NEW12345678",
            titulo_novo="COP31 TERMINA EM FRACASSO HISTÓRICO",
            tempo_rel="há 4 minutos",
            video_id_antigo="OLD87654321",
            titulo_antigo="OTAN PROMETE DEFENDER A POLÔNIA",
        )
        fake_rss_entries = [
            _gerar_fake_entry("OLD87654321", "OTAN PROMETE DEFENDER A POLÔNIA", "Parabólica"),
            _gerar_fake_entry("OLD00000002", "VÍDEO ANTERIOR DO FEED", "Parabólica"),
        ]

        with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as tf:
            temp_out = Path(tf.name)

        try:
            temp_out.write_text(json.dumps({"items": [{"video_id": "OLD87654321"}]}), encoding="utf-8")

            with patch("scripts.youtube_feeder.DEFAULT_OUT_PATH", temp_out), patch(
                "scripts.youtube_feeder._baixar_html_youtube", return_value=html_mock
            ), patch("feedparser.parse", return_value=_FakeFeedResult(fake_rss_entries)):
                res = yt_feeder.buscar_videos_canal_especifico("Parabólica", limite=3)

            self.assertTrue(res["ok"])
            self.assertEqual(res["modo_varredura"], "tempo_real_hibrida")
            videos = res["videos"]
            self.assertEqual(len(videos), 3)

            # Primeiro item: recém-lançado capturado apenas pelo HTML em tempo real
            self.assertEqual(videos[0]["video_id"], "NEW12345678")
            self.assertTrue(videos[0].get("recem_lancado"))
            self.assertEqual(videos[0].get("tempo_relativo_youtube"), "há 4 minutos")
            self.assertFalse(videos[0]["ja_publicado"])

            # Segundo item: mesclado com resumo detalhado do RSS e marcado como já publicado
            self.assertEqual(videos[1]["video_id"], "OLD87654321")
            self.assertIn("Descrição detalhada RSS", videos[1]["resumo"])
            self.assertTrue(videos[1]["ja_publicado"])

            # Terceiro item: completado pelo RSS
            self.assertEqual(videos[2]["video_id"], "OLD00000002")
            self.assertFalse(videos[2]["ja_publicado"])
        finally:
            if temp_out.exists():
                temp_out.unlink()

    def test_resolucao_link_direto_video_youtube(self):
        """Valida detecção e extração de metadados a partir de link direto do YouTube."""
        html_watch_mock = """
        <html>
          <head>
            <meta property="og:title" content="COP31 TERMINA EM FRACASSO HISTÓRICO &amp; TENSÃO">
            <meta property="og:description" content="Análise completa sobre o colapso do acordo climático.">
            <link itemprop="name" content="Parabólica">
            <meta itemprop="uploadDate" content="2026-11-22T18:27:22+00:00">
          </head>
        </html>
        """
        with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as tf:
            temp_out = Path(tf.name)

        try:
            temp_out.write_text(json.dumps({"items": []}), encoding="utf-8")
            with patch("scripts.youtube_feeder.DEFAULT_OUT_PATH", temp_out), patch(
                "scripts.youtube_feeder._baixar_html_youtube", return_value=html_watch_mock
            ):
                res = yt_feeder.buscar_videos_canal_especifico(
                    "https://www.youtube.com/watch?v=mU5deDu9FXU", limite=5
                )

            self.assertTrue(res["ok"])
            self.assertEqual(res["modo_varredura"], "video_direto")
            self.assertEqual(res["total_encontrados"], 1)
            vid = res["videos"][0]
            self.assertEqual(vid["video_id"], "mU5deDu9FXU")
            self.assertEqual(vid["titulo"], "COP31 TERMINA EM FRACASSO HISTÓRICO & TENSÃO")
            self.assertEqual(vid["canal"], "Parabólica")
            self.assertFalse(vid["ja_publicado"])
        finally:
            if temp_out.exists():
                temp_out.unlink()


if __name__ == "__main__":
    unittest.main()
