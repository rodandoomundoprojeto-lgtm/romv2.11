"""
Teste e validação automatizada das fontes YouTube de Economia (@DinheiroComVoce e Investidor Sardinha).
Executa verificação da integridade de config/sources.json, extração de feeds XML do YouTube,
obtenção de transcrições pelo coletor e sincronização no banco PostgreSQL.
"""
import json
import os
import sys
import unittest
from pathlib import Path
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT_DIR))
load_dotenv(ROOT_DIR / ".env")

import feedparser
from src.collector import load_sources, extract_youtube_video_id, parse_entry_date, get_youtube_content


class TestYouTubeFontesEconomia(unittest.TestCase):
    def setUp(self):
        self.sources = load_sources()
        self.target_cids = {
            "@DinheiroComVoce": "UCkPwI3gaSr65levrx1j9okQ",
            "Investidor Sardinha": "UCM3vJxmuJJkk1r0yzFI9eZg",
        }

    def test_sources_json_has_targets(self):
        """Verifica se ambos os canais estão devidamente cadastrados com tipo youtube e categoria economia."""
        by_name = {s.get("nome"): s for s in self.sources}
        for name, expected_cid in self.target_cids.items():
            self.assertIn(name, by_name, f"Fonte '{name}' não encontrada em config/sources.json")
            entry = by_name[name]
            self.assertEqual(entry.get("tipo"), "youtube", f"Tipo inválido para {name}")
            self.assertEqual(entry.get("categoria"), "economia", f"Categoria inválida para {name}")
            self.assertEqual(entry.get("id_ou_url"), expected_cid, f"Channel ID divergente para {name}")

    def test_sources_json_preservation(self):
        """Garante que as 34 fontes pré-existentes foram preservadas (total de 36 fontes)."""
        self.assertGreaterEqual(len(self.sources), 36, "Fontes pré-existentes parecem ter sido removidas.")
        categories = {s.get("categoria") for s in self.sources}
        self.assertTrue({"economia", "geopolitica", "cultura", "politica"}.issubset(categories))

    def test_youtube_feeds_live(self):
        """Testa se os feeds oficiais do YouTube retornam XML válido com ao menos 1 item recente."""
        for name, cid in self.target_cids.items():
            feed_url = f"https://www.youtube.com/feeds/videos.xml?channel_id={cid}"
            feed = feedparser.parse(feed_url)
            self.assertTrue(len(feed.entries) > 0, f"Nenhum vídeo retornado pelo feed do YouTube para {name}")
            first_entry = feed.entries[0]
            vid = extract_youtube_video_id(first_entry)
            self.assertTrue(bool(vid), f"Falha ao extrair Video ID da primeira entrada de {name}")
            pub_date = parse_entry_date(first_entry)
            self.assertTrue("T" in pub_date, f"Data inválida extraída de {name}: {pub_date}")

    def test_collector_transcript_extraction(self):
        """Valida que get_youtube_content consegue extrair transcrição real ou executar fallback seguro."""
        for name, cid in self.target_cids.items():
            feed_url = f"https://www.youtube.com/feeds/videos.xml?channel_id={cid}"
            feed = feedparser.parse(feed_url)
            self.assertTrue(len(feed.entries) > 0)
            entry = feed.entries[0]
            vid = extract_youtube_video_id(entry)
            content = get_youtube_content(entry, vid)
            self.assertGreaterEqual(len(content), 100, f"Conteúdo muito curto para {name}")
            self.assertTrue(content.startswith("Título:"), "Formato de saída do conteúdo inválido")

    def test_collector_robustness_edge_cases(self):
        """Testa resiliência de get_youtube_content contra entradas nulas, formatos inesperados e falhas."""
        from unittest.mock import MagicMock, patch

        # 1. Entrada com campos None
        entry_none = MagicMock()
        entry_none.title = None
        entry_none.summary = None
        entry_none.media_description = None
        res_none = get_youtube_content(entry_none, "")
        self.assertIn("Título:", res_none)

        # 2. Fallback para media_description quando vídeo não tem transcrição
        entry_desc = MagicMock()
        entry_desc.title = "Título Teste"
        entry_desc.summary = "Resumo curto"
        entry_desc.media_description = "Descrição detalhada que serve de fallback para análise"
        res_desc = get_youtube_content(entry_desc, "invalid_video_xyz")
        self.assertIn("Descrição:\nDescrição detalhada que serve de fallback", res_desc)

        # 3. Lista de transcrição contendo snippets com text None ou formato misto
        with patch("src.collector.YouTubeTranscriptApi") as mock_yt:
            mock_inst = MagicMock()
            mock_inst.fetch.return_value = [
                {"text": "Primeiro trecho importante sobre economia e investimentos com mais de cem caracteres para atingir o limite mínimo exigido pelo coletor."},
                {"text": None},
                MagicMock(text="Segundo trecho válido e muito bem estruturado."),
                MagicMock(text=None),
            ]
            mock_yt.return_value = mock_inst
            mock_yt.get_transcript = None
            delattr(mock_yt, "get_transcript")

            entry_mock = MagicMock(spec=["title", "summary"])
            entry_mock.title = "Vídeo Mock"
            entry_mock.summary = "Resumo"
            res_mock = get_youtube_content(entry_mock, "valid_mock_vid")
            self.assertIn("Transcrição:", res_mock)
            self.assertIn("Primeiro trecho importante", res_mock)
            self.assertIn("Segundo trecho válido", res_mock)

        # 4. Entrada como dicionário puro com description de fallback
        dict_desc = {
            "title": "Análise Sardinha",
            "description": "Conteúdo extraído da chave description de um dicionário puro para fallback de segurança."
        }
        res_dict = get_youtube_content(dict_desc, "")
        self.assertIn("Título: Análise Sardinha", res_dict)
        self.assertIn("Descrição:\nConteúdo extraído da chave description", res_dict)

        # 5. media_description contendo apenas espaços em branco não deve sobrescrever summary válido
        entry_ws_media = {
            "title": "Título com Resumo Válido",
            "summary": "Resumo informativo completo com mais de cem caracteres sobre indicadores econômicos, taxa Selic e inflação.",
            "media_description": "     \n\t   "
        }
        res_ws_media = get_youtube_content(entry_ws_media, "")
        self.assertIn("Resumo informativo completo", res_ws_media)

        # 6. Objeto customizado que dispara exceções arbitrárias no __getattr__
        class ObjetoQuebrado:
            def __getattr__(self, item):
                raise RuntimeError("Falha simulada no __getattr__ do objeto")

        from src.collector import _get_field
        self.assertEqual(_get_field(ObjetoQuebrado(), "qualquer_campo", "fallback_seguro"), "fallback_seguro")

    def test_extract_youtube_video_id_robustness(self):
        """Testa resiliência de extract_youtube_video_id contra formatos diversos, URLs live e dicionários."""
        from unittest.mock import MagicMock

        # Casos válidos com objeto MagicMock
        cases = [
            ("watch", "https://www.youtube.com/watch?v=PY-m1eRDT2g", "PY-m1eRDT2g"),
            ("youtu.be", "https://youtu.be/PY-m1eRDT2g", "PY-m1eRDT2g"),
            ("shorts", "https://www.youtube.com/shorts/PY-m1eRDT2g", "PY-m1eRDT2g"),
            ("embed", "https://www.youtube.com/embed/PY-m1eRDT2g", "PY-m1eRDT2g"),
            ("live", "https://www.youtube.com/live/PY-m1eRDT2g?feature=share", "PY-m1eRDT2g"),
            ("params", "https://www.youtube.com/watch?v=PY-m1eRDT2g&feature=shared", "PY-m1eRDT2g"),
        ]
        for desc, link, expected in cases:
            entry = MagicMock(spec=["link"])
            entry.link = link
            self.assertEqual(extract_youtube_video_id(entry), expected, f"Falha no caso {desc}")

        # Suporte a entradas em formato de dicionário puro
        self.assertEqual(extract_youtube_video_id({"yt_videoid": "DICT_VID_01"}), "DICT_VID_01")
        self.assertEqual(extract_youtube_video_id({"id": "yt:video:DICT_VID_02"}), "DICT_VID_02")
        self.assertEqual(extract_youtube_video_id({"link": "https://www.youtube.com/live/DICT_VID_03"}), "DICT_VID_03")

        # Formato canônico do YouTube XML (<id>yt:video:ID</id>)
        entry_canon = MagicMock(spec=["id"])
        entry_canon.id = "yt:video:CANONICAL12"
        self.assertEqual(extract_youtube_video_id(entry_canon), "CANONICAL12")

        # Prioridade de yt_videoid quando é um ID válido de 11 caracteres
        entry_yt = MagicMock()
        entry_yt.yt_videoid = "FAST_ID_123"
        self.assertEqual(extract_youtube_video_id(entry_yt), "FAST_ID_123")

        # yt_videoid corrompido / não compatível com 11 caracteres deve fazer fallback para link válido
        entry_corrupt_yt = {
            "yt_videoid": "not_an_11_char_id",
            "link": "https://www.youtube.com/watch?v=PY-m1eRDT2g"
        }
        self.assertEqual(extract_youtube_video_id(entry_corrupt_yt), "PY-m1eRDT2g")

        # Casos nulos / malformados sem lançar exceção
        entry_null_yt = MagicMock()
        entry_null_yt.yt_videoid = None
        entry_null_yt.link = None
        self.assertEqual(extract_youtube_video_id(entry_null_yt), "")

        entry_empty = MagicMock(spec=[])
        self.assertEqual(extract_youtube_video_id(entry_empty), "")

    def test_parse_entry_date_robustness(self):
        """Testa resiliência de parse_entry_date contra valores malformados, dicionários e strings ISO."""
        from unittest.mock import MagicMock

        # Entrada como dicionário com published_parsed
        d_parsed = {"published_parsed": (2026, 11, 15, 12, 0, 0, 0, 0, 0)}
        self.assertTrue(parse_entry_date(d_parsed).startswith("2026-11-15T12:00:00"))

        # Entrada como dicionário com string ISO
        d_iso = {"published": "2026-11-15T10:30:00Z"}
        self.assertTrue("2026-11-15" in parse_entry_date(d_iso))

        entry_bad_parsed = MagicMock()
        entry_bad_parsed.published_parsed = "invalid_string_date"
        date_bad = parse_entry_date(entry_bad_parsed)
        self.assertIn("T", date_bad)

        entry_short_tuple = MagicMock()
        entry_short_tuple.published_parsed = (2026, 11)
        date_short = parse_entry_date(entry_short_tuple)
        self.assertIn("T", date_short)

        entry_none = MagicMock()
        entry_none.published_parsed = None
        entry_none.updated_parsed = None
        date_none = parse_entry_date(entry_none)
        self.assertIn("T", date_none)

    def test_database_sync(self):
        """Valida que as fontes estão cadastradas e ativas em ai_fontes_referencia se o DB estiver disponível."""
        db_url = os.getenv("DATABASE_URL") or os.getenv("POSTGRES_URL")
        if not db_url:
            self.skipTest("DATABASE_URL não configurada.")

        import psycopg
        with psycopg.connect(db_url) as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT nome, tipo_fonte, ativo 
                    FROM ai_fontes_referencia 
                    WHERE url LIKE '%UCkPwI3gaSr65levrx1j9okQ%' OR url LIKE '%UCM3vJxmuJJkk1r0yzFI9eZg%'
                """)
                rows = cur.fetchall()
                self.assertEqual(len(rows), 2, f"Esperado 2 registros no DB, encontrados: {len(rows)}")
                for r in rows:
                    self.assertEqual(r[1], "youtube_rss")
                    self.assertTrue(r[2], f"Fonte {r[0]} está inativa no DB")


    def test_collect_new_items_feed_url_sanitization(self):
        """Testa se collect_new_items lida corretamente tanto com Channel ID puro quanto com URL completa."""
        from unittest.mock import patch, MagicMock
        from src.collector import collect_new_items

        fake_sources = [
            {"nome": "Fonte ID Puro", "tipo": "youtube", "id_ou_url": "UCkPwI3gaSr65levrx1j9okQ", "categoria": "economia"},
            {"nome": "Fonte URL Completa", "tipo": "youtube", "id_ou_url": "https://www.youtube.com/feeds/videos.xml?channel_id=UCkPwI3gaSr65levrx1j9okQ", "categoria": "economia"},
        ]

        called_urls = []
        def fake_parse(url):
            called_urls.append(url)
            m = MagicMock()
            m.entries = []
            return m

        with patch("src.collector.load_sources", return_value=fake_sources), \
             patch("src.collector.load_history", return_value=set()), \
             patch("src.collector.feedparser.parse", side_effect=fake_parse):
            items = collect_new_items()
            self.assertEqual(len(called_urls), 2)
            for u in called_urls:
                self.assertEqual(u, "https://www.youtube.com/feeds/videos.xml?channel_id=UCkPwI3gaSr65levrx1j9okQ")


if __name__ == "__main__":
    unittest.main()
