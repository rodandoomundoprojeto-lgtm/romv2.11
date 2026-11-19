#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json
import os
import tempfile
import unittest
from unittest import mock

from scripts import grok_x_feeder


class TestGrokXFeeder(unittest.TestCase):
    def setUp(self):
        self.repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        config_path = os.path.join(self.repo_root, "scripts", "config_grok.json")
        sitemap_path = os.path.join(self.repo_root, "sitemap.xml")
        with open(config_path, "r", encoding="utf-8") as f:
            self.config = json.load(f)
        self.allowed_routes = grok_x_feeder.load_allowed_routes_from_sitemap(sitemap_path)

    def test_extract_json_from_markdown(self):
        raw_text = 'Aqui está o resultado:\n```json\n{"items": [{"titulo": "Teste X", "codigoPais": "BR"}]}\n```'
        parsed = grok_x_feeder.extract_json_from_text(raw_text)
        self.assertIn("items", parsed)
        self.assertEqual(parsed["items"][0]["titulo"], "Teste X")

    def test_parse_responses_api_output_and_citations(self):
        fake_response = {
            "id": "resp_123",
            "citations": [
                "https://www.reuters.com/world/europe/deal-2026/?utm_source=x",
                "https://x.com/folha/status/1234567890",
            ],
            "output": [
                {"type": "x_search_call", "id": "call_1", "status": "completed"},
                {
                    "type": "message",
                    "role": "assistant",
                    "content": [
                        {
                            "type": "output_text",
                            "text": '{"items": [{"titulo": "Noticia 1"}]}',
                            "annotations": [
                                {
                                    "type": "url_citation",
                                    "url": "https://apnews.com/article/economy-2026",
                                    "title": "AP News",
                                },
                                {
                                    "type": "url_citation",
                                    "url": "https://x.com/folha/status/1234567890",
                                },
                            ],
                        }
                    ],
                },
            ],
        }
        text, citations = grok_x_feeder.parse_responses_api_output(fake_response)
        self.assertIn('"Noticia 1"', text)
        self.assertEqual(
            citations,
            [
                "https://www.reuters.com/world/europe/deal-2026/?utm_source=x",
                "https://x.com/folha/status/1234567890",
                "https://apnews.com/article/economy-2026",
            ],
        )

    def test_parse_responses_api_top_level_output_text_fallback(self):
        fake_response = {
            "output_text": '{"items": []}',
            "citations": ["https://www.bbc.com/news/world-1"],
        }
        text, citations = grok_x_feeder.parse_responses_api_output(fake_response)
        self.assertEqual(text, '{"items": []}')
        self.assertEqual(citations, ["https://www.bbc.com/news/world-1"])

    def test_item_dropped_when_url_not_cited_and_kept_when_normalized_or_domain_matches(self):
        citations = [
            "https://www.reuters.com/world/europe/deal-2026/?utm_source=twitter&utm_medium=social",
            "https://apnews.com/article/real-cited-story",
        ]
        raw_items = [
            {
                "relevancia": 1,
                "titulo": "URL bate após normalização (sem www, barra final, utm)",
                "url": "https://reuters.com/world/europe/deal-2026/",
                "dominio": "reuters.com",
                "codigoPais": "fr",
                "continente": "europa",
                "tipoNoticia": "politica",
            },
            {
                "relevancia": 2,
                "titulo": "URL diferente mas domínio bate com citação real",
                "url": "https://apnews.com/article/outro-slug",
                "dominio": "apnews.com",
                "codigoPais": "us",
                "continente": "norte",
                "tipoNoticia": "politica",
            },
            {
                "relevancia": 3,
                "titulo": "URL inventada e domínio não citado deve ser descartada",
                "url": "https://site-inventado.example.com/fake-news",
                "dominio": "site-inventado.example.com",
                "codigoPais": "br",
                "continente": "sul",
                "tipoNoticia": "politica",
            },
        ]
        items, _ = grok_x_feeder.enrich_and_validate_items(
            {"items": raw_items},
            self.config,
            citations=citations,
            allowed_routes=self.allowed_routes,
            require_citations=True,
        )
        self.assertEqual(len(items), 2)
        self.assertEqual(items[0]["url"], citations[0])
        self.assertEqual(items[0]["codigoPais"], "FR")
        self.assertEqual(items[1]["url"], citations[1])
        self.assertEqual(items[1]["codigoPais"], "US")

    def test_zero_citations_returns_empty_when_required(self):
        seed = grok_x_feeder.get_seed_items()
        items, topicos = grok_x_feeder.enrich_and_validate_items(
            {"items": seed},
            self.config,
            citations=[],
            allowed_routes=self.allowed_routes,
            require_citations=True,
        )
        self.assertEqual(items, [])
        self.assertEqual(topicos, {})

    def test_pagina_tematica_and_explicacao_nulled_when_not_in_sitemap(self):
        raw_items = [
            {
                "relevancia": 1,
                "titulo": "Rota inexistente deve virar null (Regra 11)",
                "url": "https://www.reuters.com/world/1",
                "dominio": "reuters.com",
                "codigoPais": "JP",
                "continente": "asia",
                "tipoNoticia": "mundo",
                "paginaTematica": "/rota-que-nao-existe-404",
                "labelTematica": "Inexistente",
                "explicacaoId": "slug-inventado-404",
            },
            {
                "relevancia": 2,
                "titulo": "Wildcard tecnologia existe no sitemap",
                "url": "https://www.reuters.com/tech/2",
                "dominio": "reuters.com",
                "codigoPais": "JP",
                "continente": "asia",
                "tipoNoticia": "tecnologia",
            },
        ]
        items, _ = grok_x_feeder.enrich_and_validate_items(
            {"items": raw_items},
            self.config,
            citations=["https://www.reuters.com/world/1", "https://www.reuters.com/tech/2"],
            allowed_routes=self.allowed_routes,
            require_citations=True,
        )
        self.assertEqual(len(items), 2)
        self.assertIsNone(items[0]["paginaTematica"])
        self.assertIsNone(items[0]["labelTematica"])
        self.assertIsNone(items[0]["explicacaoId"])
        self.assertEqual(items[1]["paginaTematica"], "/tecnologia")
        self.assertEqual(items[1]["labelTematica"], "Tecnologia")

    def test_less_than_three_items_does_not_overwrite_existing_file(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            out_file = os.path.join(tmpdir, "noticias_x.json")
            original_content = '{"sentinel": "keep-me", "items": [1, 2, 3]}\n'
            with open(out_file, "w", encoding="utf-8") as f:
                f.write(original_content)

            two_items = [
                {"relevancia": 1, "titulo": "A", "url": "https://reuters.com/1"},
                {"relevancia": 2, "titulo": "B", "url": "https://reuters.com/2"},
            ]
            wrote = grok_x_feeder.persist_edition(two_items, {"BR": ["Teste"]}, "grok-4.7", out_file, is_mock=False)
            self.assertFalse(wrote)

            with open(out_file, "r", encoding="utf-8") as f:
                self.assertEqual(f.read(), original_content)

    def test_cli_mock_requires_out_and_writes_mock_true(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            out_file = os.path.join(tmpdir, "mock_noticias_x.json")

            # Sem --out deve recusar (exit code 1)
            with self.assertRaises(SystemExit) as ctx:
                grok_x_feeder.main(["--mock"])
            self.assertEqual(ctx.exception.code, 1)

            # Com --out deve gravar com mock: true e codigoPais MAIÚSCULO
            grok_x_feeder.main(["--mock", "--out", out_file])
            self.assertTrue(os.path.isfile(out_file))
            with open(out_file, "r", encoding="utf-8") as f:
                loaded = json.load(f)

            self.assertTrue(loaded["mock"])
            self.assertGreaterEqual(loaded["total"], 3)
            self.assertEqual(loaded["total"], len(loaded["items"]))
            self.assertTrue(all(it["codigoPais"] == it["codigoPais"].upper() for it in loaded["items"]))
            self.assertTrue(all(k == k.upper() for k in loaded["topicosEmAltaPorPais"].keys()))
            self.assertEqual(loaded["items"][0]["paginaTematica"], "/politica/brasil")

    def test_cli_exits_2_and_preserves_file_when_api_returns_fewer_than_3_cited_items(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            out_file = os.path.join(tmpdir, "noticias_x.json")
            original_content = '{"preserved": true}\n'
            with open(out_file, "w", encoding="utf-8") as f:
                f.write(original_content)

            fake_raw = {
                "items": [
                    {
                        "relevancia": 1,
                        "titulo": "Unico item valido",
                        "url": "https://www.reuters.com/world/only-one",
                        "dominio": "reuters.com",
                        "codigoPais": "BR",
                        "continente": "sul",
                        "tipoNoticia": "politica",
                    }
                ]
            }
            with mock.patch.object(grok_x_feeder, "get_api_key", return_value="xai-test-key-123"), \
                 mock.patch.object(
                     grok_x_feeder,
                     "call_grok_api",
                     return_value=(fake_raw, "grok-4.7", ["https://www.reuters.com/world/only-one"]),
                 ):
                with self.assertRaises(SystemExit) as ctx:
                    grok_x_feeder.main(["--out", out_file])
                self.assertEqual(ctx.exception.code, 2)

            with open(out_file, "r", encoding="utf-8") as f:
                self.assertEqual(f.read(), original_content)

    def test_map_radar_category_and_analise_preserved(self):
        valid_radar_cats = {"geopolitica", "politica", "economia", "cultura"}

        self.assertEqual(grok_x_feeder.map_radar_category("politica", "BR", "Brasil · Política & Fiscal"), "politica")
        self.assertEqual(grok_x_feeder.map_radar_category("economia", "BR", "Economia & Juros"), "economia")
        self.assertEqual(grok_x_feeder.map_radar_category("politica", "US", "Geopolítica & EUA"), "geopolitica")
        self.assertEqual(grok_x_feeder.map_radar_category("tecnologia", "US", "Tecnologia & IA"), "geopolitica")
        self.assertEqual(grok_x_feeder.map_radar_category("cultura", "BR", "Cultura"), "cultura")
        self.assertEqual(grok_x_feeder.map_radar_category("esportes", "BR", "Esportes"), "cultura")
        self.assertEqual(grok_x_feeder.map_radar_category("saude", "FR", "Saúde"), "cultura")
        self.assertEqual(grok_x_feeder.map_radar_category("politica", "BR", "Diplomacia & ONU"), "geopolitica")

        seed = grok_x_feeder.get_seed_items()
        items, _ = grok_x_feeder.enrich_and_validate_items(
            {"items": seed},
            self.config,
            allowed_routes=self.allowed_routes,
            require_citations=False,
        )
        self.assertEqual(len(items), len(seed))
        for it in items:
            self.assertIn(it["categoriaRadar"], valid_radar_cats)
            self.assertTrue(it["analise"], "Campo analise deve ser preservado nos itens normalizados")
        self.assertEqual(items[0]["categoriaRadar"], "politica")     # BR politica
        self.assertEqual(items[1]["categoriaRadar"], "geopolitica")  # US politica
        self.assertEqual(items[2]["categoriaRadar"], "economia")     # BR economia


if __name__ == "__main__":
    unittest.main()
