"""Testes automatizados M1 (F12-F15): ciclos sucessivos de coleta, persistência, ordenação e API."""
import asyncio
import json
import os
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient


class TestM1FreshnessCycles(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.vitrine_path = self.root / "vitrine_ia.json"
        self.feed_path = self.root / "feed_output.json"

    def tearDown(self):
        self.temp_dir.cleanup()

    # ------------------------------------------------------------------
    # F12 / F13 / F14: Parsing de datas, TZ invariance e sort-before-slice
    # ------------------------------------------------------------------

    def test_coletor_estudo_utc_e_sort_before_slice(self):
        from redacao_v2 import coletor_estudo

        # 1. Timezone invariance em extrair_data_publicacao
        entry_utc = {"published_parsed": (2026, 11, 18, 12, 0, 0, 0, 0, 0)}
        with patch.dict(os.environ, {"TZ": "America/Sao_Paulo"}, clear=False):
            if hasattr(os, "name") and hasattr(__import__("time"), "tzset"):
                __import__("time").tzset()
            iso_sp = coletor_estudo.extrair_data_publicacao(entry_utc)
        self.assertEqual(iso_sp, "2026-11-18T12:00:00+00:00")

        # Fallback RFC-2822 e ausência de data -> None
        self.assertEqual(
            coletor_estudo.extrair_data_publicacao({"published": "Wed, 18 Nov 2026 11:30:00 GMT"}),
            "2026-11-18T11:30:00+00:00",
        )
        self.assertIsNone(coletor_estudo.extrair_data_publicacao({"title": "Sem data"}))

        # 2. Sort-before-slice e corte de idade/sem-data no pulso 30m
        agora = datetime.now(timezone.utc)
        fmt_rss = lambda dt: dt.strftime("%a, %d %b %Y %H:%M:%S +0000")
        xml_feed_a = f"""<?xml version="1.0" encoding="UTF-8"?>
        <rss version="2.0"><channel><title>Feed A</title>
          <item><title>Antiga demais 72h</title><link>https://a.test/old72</link><pubDate>{fmt_rss(agora - timedelta(hours=72))}</pubDate></item>
          <item><title>Sem data</title><link>https://a.test/nodate</link></item>
          <item><title>Intermediaria 2h</title><link>https://a.test/mid2h</link><pubDate>{fmt_rss(agora - timedelta(hours=2))}</pubDate></item>
          <item><title>Mais nova A 10m</title><link>https://a.test/new10m</link><pubDate>{fmt_rss(agora - timedelta(minutes=10))}</pubDate></item>
        </channel></rss>""".encode("utf-8")

        xml_feed_b = f"""<?xml version="1.0" encoding="UTF-8"?>
        <rss version="2.0"><channel><title>Feed B</title>
          <item><title>Antiga B 10h</title><link>https://b.test/old10h</link><pubDate>{fmt_rss(agora - timedelta(hours=10))}</pubDate></item>
          <item><title>Breakings B 2m</title><link>https://b.test/new2m</link><pubDate>{fmt_rss(agora - timedelta(minutes=2))}</pubDate></item>
        </channel></rss>""".encode("utf-8")

        class FakeResp:
            def __init__(self, content):
                self.content = content

            def raise_for_status(self):
                return None

        class FakeAsyncClient:
            def __init__(self, *args, **kwargs):
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, *args):
                return False

            async def get(self, url, **kwargs):
                return FakeResp(xml_feed_a if "feed-a" in url else xml_feed_b)

        with patch.object(coletor_estudo.httpx, "AsyncClient", FakeAsyncClient):
            itens = asyncio.run(
                coletor_estudo.coletar_noticias_quentes_30min_async(
                    max_itens_por_fonte=1,
                    fontes_custom=["https://feed-a.test/rss", "https://feed-b.test/rss"],
                )
            )

        titulos = [it["titulo"] for it in itens]
        # Mesmo com max_itens_por_fonte=1, deve pegar o mais novo de cada feed (sort-before-slice)
        # e ordenar globalmente (2m de Feed B antes de 10m de Feed A)
        self.assertEqual(titulos, ["Breakings B 2m", "Mais nova A 10m"])

    def test_curadoria_coletor_rejeita_sem_data_e_ordena_antes_de_fatiar(self):
        from curadoria.agente import coletor as cur_coletor

        agora = datetime.now(timezone.utc)
        fmt_rss = lambda dt: dt.strftime("%a, %d %b %Y %H:%M:%S +0000")

        self.assertFalse(cur_coletor.dentro_da_janela_tempo({"title": "Sem data"}, horas_limite=12))
        self.assertTrue(
            cur_coletor.dentro_da_janela_tempo(
                {"updated_parsed": (agora - timedelta(minutes=30)).utctimetuple()},
                horas_limite=12,
            )
        )

        xml_feed = f"""<?xml version="1.0" encoding="UTF-8"?>
        <rss version="2.0"><channel><title>Feed Curadoria</title>
          <item><title>Sem data ignorada</title><link>https://c.test/nodate</link></item>
          <item><title>Antiga 20h</title><link>https://c.test/20h</link><pubDate>{fmt_rss(agora - timedelta(hours=20))}</pubDate></item>
          <item><title>Recente 3h</title><link>https://c.test/3h</link><pubDate>{fmt_rss(agora - timedelta(hours=3))}</pubDate></item>
          <item><title>Novissima 5m</title><link>https://c.test/5m</link><pubDate>{fmt_rss(agora - timedelta(minutes=5))}</pubDate></item>
        </channel></rss>""".encode("utf-8")

        fake_resp = MagicMock(content=xml_feed)
        with patch.object(cur_coletor, "FEEDS_RSS_RODANDO_O_MUNDO", {"Politica": ["https://c.test/rss"]}):
            with patch.object(cur_coletor, "carregar_feeds_sources_json", return_value={}):
                with patch.object(cur_coletor.requests, "get", return_value=fake_resp):
                    itens = cur_coletor.coletar_feeds_rss(horas_limite=12, por_feed=1)

        self.assertEqual(len(itens), 1)
        self.assertEqual(itens[0]["titulo"], "Novissima 5m")
        self.assertTrue(itens[0]["data_publicacao"].endswith("Z"))

    def test_src_collector_sem_now_e_ordena_antes_slice(self):
        from src import collector

        self.assertEqual(collector.parse_entry_date({"title": "Sem data"}), "")
        self.assertTrue(
            collector.parse_entry_date(
                {"published_parsed": "lixo", "updated": "Wed, 18 Nov 2026 11:00:00 GMT"}
            ).startswith("2026-11-18T11:00:00")
        )

        agora = datetime.now(timezone.utc)
        entries = [
            {
                "id": f"id-old-{i}",
                "title": f"Antiga {i} " + ("x" * 100),
                "link": f"https://src.test/old/{i}",
                "summary": "Resumo detalhado suficiente para passar da regra de 100 caracteres no coletor.",
                "published_parsed": (agora - timedelta(hours=10 + i)).utctimetuple(),
            }
            for i in range(6)
        ] + [
            {
                "id": "id-newest",
                "title": "Novissima Breaking " + ("y" * 100),
                "link": "https://src.test/newest",
                "summary": "Resumo detalhado suficiente para passar da regra de 100 caracteres no coletor.",
                "published_parsed": (agora - timedelta(minutes=3)).utctimetuple(),
            }
        ]

        fake_feed = MagicMock()
        fake_feed.entries = entries
        with patch.object(collector, "load_sources", return_value=[{"nome": "Src", "tipo": "rss", "id_ou_url": "https://src.test/rss", "categoria": "geopolitica"}]):
            with patch.object(collector, "load_history", return_value=set()):
                with patch.object(collector.feedparser, "parse", return_value=fake_feed):
                    itens = collector.collect_new_items()

        self.assertEqual(len(itens), 5)
        self.assertEqual(itens[0]["item_id"], "id-newest")

    # ------------------------------------------------------------------
    # F12 + F13: Ciclos intercalados pulso -> curadoria -> pulso
    # ------------------------------------------------------------------

    def test_ciclos_intercalados_pulso_curadoria_pulso_preserva_e_ordena(self):
        from curadoria import pipeline as cur_pipe
        from curadoria.agente.schemas import CuradoriaPayload
        from redacao_v2.pulso_noticias_quentes import salvar_snapshot_vitrine_pulso

        agora = datetime.now(timezone.utc)
        iso = lambda dt: dt.strftime("%Y-%m-%dT%H:%M:%SZ")

        # Seed legado de 2026-11-16 sem expires_at (deve ser podado pelo pulso)
        self.vitrine_path.write_text(
            json.dumps(
                {
                    "ok": True,
                    "updatedAt": "2026-11-16T22:00:00Z",
                    "temas_ativos": [
                        {
                            "slug": "legado-expirado-2026-11-16",
                            "titulo_tema": "Notícia antiga de 16/11",
                            "data_publicacao": "2026-11-16T22:00:00Z",
                            "updated_at": "2026-11-16T22:00:00Z",
                        }
                    ],
                    "noticias_quentes": [
                        {
                            "slug": "legado-expirado-2026-11-16",
                            "titulo_curto": "Notícia antiga de 16/11",
                            "data_publicacao": "2026-11-16T22:00:00Z",
                        }
                    ],
                }
            ),
            encoding="utf-8",
        )

        # Ciclo 1: Pulso 30m grava 2 notícias quentes (a mais antiga com urgência maior!)
        ts_antiga_pulso = iso(agora - timedelta(minutes=40))
        ts_recente_pulso = iso(agora - timedelta(minutes=5))
        lote_pulso_1 = {
            "batch_id": "pulso-c1",
            "noticias_quentes": [
                {
                    "slug": "pulso-antiga-score-alto",
                    "titulo_curto": "Pulso Antiga Score 99",
                    "resumo_pulso": "Resumo inicial",
                    "urgencia_score": 99,
                    "relevancia_score": 99,
                    "ttl_horas": 6,
                    "data_publicacao": ts_antiga_pulso,
                },
                {
                    "slug": "pulso-recente-score-baixo",
                    "titulo_curto": "Pulso Recente Score 70",
                    "resumo_pulso": "Resumo recente",
                    "urgencia_score": 70,
                    "relevancia_score": 70,
                    "ttl_horas": 6,
                    "data_publicacao": ts_recente_pulso,
                },
            ],
        }
        salvar_snapshot_vitrine_pulso(lote_pulso_1, caminho=self.vitrine_path)
        snap_1 = json.loads(self.vitrine_path.read_text(encoding="utf-8"))

        slugs_1 = [t["slug"] for t in snap_1["temas_ativos"]]
        self.assertNotIn("legado-expirado-2026-11-16", slugs_1)
        self.assertEqual(slugs_1, ["pulso-recente-score-baixo", "pulso-antiga-score-alto"])
        self.assertIn("expires_at", snap_1["temas_ativos"][0])
        self.assertIn("ttl_horas", snap_1["temas_ativos"][0])
        expires_original_antiga = snap_1["temas_ativos"][1]["expires_at"]

        # Ciclo 2: Curadoria 3h roda e NÃO pode apagar temas do pulso nem notícias quentes
        old_vitrine = cur_pipe.SNAPSHOT_VITRINE
        cur_pipe.SNAPSHOT_VITRINE = self.vitrine_path
        try:
            payload_curadoria = CuradoriaPayload.model_validate(
                {
                    "batch_id": "curadoria-c2",
                    "insights": [
                        {
                            "slug": "curadoria-tema-01",
                            "titulo_tema": "Tema de Curadoria 3h",
                            "status": "em_alta",
                            "categoria_primaria": "Economia",
                            "categorias_cruzadas": ["Geopolitica_Radar"],
                            "relevancia_score": 98,
                            "ttl_horas": 24,
                            "palavras_chave_busca": ["economia", "cambio", "juros", "brasil"],
                            "gatilho_vitrine": "Impactos no câmbio",
                            "sintese_nerd": "Análise macroeconômica detalhada.",
                            "sugestao_pauta_gap": {
                                "titulo_seo": "Entenda os impactos macroeconômicos do câmbio hoje",
                                "angulo_editorial": "Análise estrutural da taxa de câmbio e inflação.",
                                "formato_ideal": "Analise Geopolitica",
                            },
                        }
                    ],
                }
            )
            cur_pipe.salvar_snapshot_vitrine(payload_curadoria)
        finally:
            cur_pipe.SNAPSHOT_VITRINE = old_vitrine

        snap_2 = json.loads(self.vitrine_path.read_text(encoding="utf-8"))
        slugs_2 = [t["slug"] for t in snap_2["temas_ativos"]]
        self.assertIn("pulso-recente-score-baixo", slugs_2)
        self.assertIn("pulso-antiga-score-alto", slugs_2)
        self.assertIn("curadoria-tema-01", slugs_2)
        self.assertIn("temas_curadoria", snap_2)
        self.assertEqual(len(snap_2["noticias_quentes"]), 2)

        # Ciclo 3: Novo Pulso re-vê `pulso-antiga-score-alto` (com novo timestamp falso) + traz breaking nova
        ts_breaking = iso(agora + timedelta(seconds=10))
        lote_pulso_3 = {
            "batch_id": "pulso-c3",
            "noticias_quentes": [
                {
                    "slug": "pulso-antiga-score-alto",
                    "titulo_curto": "Pulso Antiga Score 99",
                    "resumo_pulso": "Resumo inicial",
                    "urgencia_score": 99,
                    "relevancia_score": 99,
                    "ttl_horas": 6,
                    "data_publicacao": ts_breaking,
                },
                {
                    "slug": "pulso-breaking-nova",
                    "titulo_curto": "Breaking Agora Score 65",
                    "resumo_pulso": "Fato de última hora",
                    "urgencia_score": 65,
                    "relevancia_score": 65,
                    "ttl_horas": 6,
                    "data_publicacao": ts_breaking,
                },
            ],
        }
        salvar_snapshot_vitrine_pulso(lote_pulso_3, caminho=self.vitrine_path)
        snap_3 = json.loads(self.vitrine_path.read_text(encoding="utf-8"))

        por_slug_3 = {t["slug"]: t for t in snap_3["temas_ativos"]}
        # Timestamp e expires_at originais preservados sem deslizar para frente
        self.assertEqual(por_slug_3["pulso-antiga-score-alto"]["data_publicacao"], ts_antiga_pulso)
        self.assertEqual(por_slug_3["pulso-antiga-score-alto"]["expires_at"], expires_original_antiga)
        # Breaking nova (score 65) vem antes da antiga (score 99)
        self.assertEqual(snap_3["temas_ativos"][0]["slug"], "pulso-breaking-nova")
        self.assertIn("temas_curadoria", snap_3)

    # ------------------------------------------------------------------
    # F14: Publisher (DB autoritativo, rodízio limitado, cards manuais)
    # ------------------------------------------------------------------

    def test_publisher_db_autoritativo_rodizio_limitado_e_cards_manuais(self):
        from src import estado_db, publisher

        # 1. Quando DB tem dados, não ressuscita arquivo local antigo
        itens_db_novos = [{"titulo": "Notícia DB Nova", "data_publicacao": "2026-11-18T12:00:00+00:00"}]
        self.feed_path.write_text(
            json.dumps([{"titulo": "Notícia Velha Disco", "data_publicacao": "2026-11-15T10:00:00+00:00"}]),
            encoding="utf-8",
        )
        with patch.object(publisher, "FEED_OUTPUT_PATH", publisher.FEED_OUTPUT_PATH_PADRAO):
            with patch("src.estado_db.ler_estado", return_value=itens_db_novos):
                res_feed = publisher._ler_feed_existente()
        self.assertEqual([it["titulo"] for it in res_feed], ["Notícia DB Nova"])

        # 2. sortir_cards_rodizio_amplo não rebaixa notícia breaking para trás de item 6h mais velho
        agora = datetime(2026, 11, 18, 12, 0, tzinfo=timezone.utc)
        cards = [
            {"titulo": "V2 Antigo 6h", "fonte_nome": "Pulso V2", "origem_v2": True, "data_publicacao": (agora - timedelta(hours=6)).isoformat()},
            {"titulo": "G1 Novo 1", "fonte_nome": "G1", "data_publicacao": agora.isoformat()},
            {"titulo": "G1 Novo 2", "fonte_nome": "G1", "data_publicacao": (agora - timedelta(minutes=2)).isoformat()},
            {"titulo": "G1 Novo 3", "fonte_nome": "G1", "data_publicacao": (agora - timedelta(minutes=5)).isoformat()},
            {"titulo": "Folha Antiga 6h", "fonte_nome": "Folha", "data_publicacao": (agora - timedelta(hours=6)).isoformat()},
        ]
        sortidos = publisher.sortir_cards_rodizio_amplo(cards, max_v2_topo=2)
        self.assertEqual([c["titulo"] for c in sortidos[:3]], ["G1 Novo 1", "G1 Novo 2", "G1 Novo 3"])

        # 3. publish_cards não carimba sem data com now() e cards manuais ordenam/limitam
        old_feed_path = publisher.FEED_OUTPUT_PATH
        publisher.FEED_OUTPUT_PATH = str(self.feed_path)
        try:
            self.feed_path.write_text("[]", encoding="utf-8")
            publisher.publish_cards(
                [
                    {"titulo": "Sem Data", "fonte_url": "https://p.test/nodate", "fonte_nome": "F1", "categoria": "geral"},
                    {"titulo": "Com Data", "fonte_url": "https://p.test/dated", "fonte_nome": "F2", "categoria": "geral", "data_publicacao": "2026-11-18T11:00:00Z"},
                ]
            )
            salvo = json.loads(self.feed_path.read_text(encoding="utf-8"))
            self.assertEqual(salvo[0]["titulo"], "Com Data")
            self.assertEqual(salvo[1]["data_publicacao"], "")

            publisher.publicar_card_manual(
                {"slug": "manual-antigo", "titulo": "Manual Antigo", "resumo": "R", "data_publicacao": "2026-11-18T08:00:00Z"},
                max_items=2,
            )
            publisher.publicar_card_manual(
                {"slug": "manual-novo", "titulo": "Manual Novo", "resumo": "R", "data_publicacao": "2026-11-18T12:30:00Z"},
                max_items=2,
            )
            salvo_manual = json.loads(self.feed_path.read_text(encoding="utf-8"))
            self.assertEqual(len(salvo_manual), 2)
            self.assertEqual(salvo_manual[0]["slug"], "manual-novo")
        finally:
            publisher.FEED_OUTPUT_PATH = old_feed_path

        # 4. estado_db.atualizar_estado executa pg_advisory_xact_lock antes de FOR UPDATE
        executed_sql = []
        fake_cur = MagicMock()
        fake_cur.fetchone.return_value = None
        fake_cur.execute.side_effect = lambda sql, params=None: executed_sql.append(str(sql))
        fake_conn = MagicMock()
        fake_conn.__enter__.return_value = fake_conn
        fake_conn.cursor.return_value.__enter__.return_value = fake_cur
        with patch.object(estado_db, "_conectar", return_value=fake_conn):
            with patch.object(estado_db, "garantir_tabela"):
                estado_db.atualizar_estado("feed_output", lambda x: x, default=[])
        self.assertTrue(any("pg_advisory_xact_lock" in s for s in executed_sql))

    # ------------------------------------------------------------------
    # F15: FastAPI endpoints ordering, empty-DB fallback & cache headers
    # ------------------------------------------------------------------

    def test_fastapi_routes_v2_recency_fallback_e_cache_bypass(self):
        from api import routes_v2

        app = FastAPI()
        app.include_router(routes_v2.router)

        agora = datetime.now(timezone.utc)
        queries_executadas = []

        class FakeCursor:
            def __init__(self):
                self._rows = []

            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

            def execute(self, sql, params=None):
                sql_str = " ".join(str(sql).split())
                queries_executadas.append((sql_str, params))
                if "FROM tags_expandidas" in sql_str or "WITH artigos_ativos" in sql_str:
                    self._rows = [
                        {
                            "tag_norm": "cambio",
                            "tag_display": "Câmbio",
                            "artigos_count": 2,
                            "score_max": 90.0,
                            "ultima_atualizacao": agora,
                        }
                    ]
                elif "FROM ai_noticias_quentes" in sql_str:
                    if "expires_at > NOW()" in sql_str:
                        self._rows = []  # Simula banco sem linhas dentro do TTL estrito
                    else:
                        self._rows = [
                            {
                                "slug": "fb-nova",
                                "batch_id": "b1",
                                "titulo_curto": "Fallback Recente",
                                "resumo_pulso": "R",
                                "impacto_pratico": "I",
                                "categoria": "Geopolitica_Relacoes",
                                "paises_envolvidos": ["BR"],
                                "urgencia_score": 60,
                                "relevancia_score": 60,
                                "nivel_confianca": "alta",
                                "ttl_horas": 6,
                                "horas_em_destaque": 6,
                                "veiculos_origem": ["V1"],
                                "fontes_urls": [],
                                "palavras_chave": ["brasil"],
                                "links_internos_relacionados": [],
                                "status": "ativo",
                                "destaque_ate": agora - timedelta(hours=1),
                                "expires_at": agora - timedelta(hours=1),
                                "created_at": agora - timedelta(hours=2),
                                "updated_at": agora - timedelta(hours=1),
                            }
                        ]
                elif "FROM ai_eventos" in sql_str:
                    self._rows = []
                elif "FROM atlas_pulso_continental" in sql_str:
                    self._rows = [
                        {
                            "continent_key": "americas",
                            "headlines_json": [
                                {"title": "Antiga", "publishedAt": "2026-11-18T08:00:00Z"},
                                {"title": "Recente", "publishedAt": "2026-11-18T12:00:00Z"},
                            ],
                            "active_countries": ["BR"],
                            "updated_at": agora,
                        }
                    ]
                else:
                    self._rows = []

            def fetchall(self):
                return list(self._rows)

            def fetchone(self):
                return self._rows[0] if self._rows else None

        class FakeConn:
            def cursor(self):
                return FakeCursor()

            def rollback(self):
                pass

        app.dependency_overrides[routes_v2.get_db] = lambda: FakeConn()
        routes_v2._SUGESTOES_CACHE.clear()
        client = TestClient(app)

        # 1. /v1/noticias-quentes: recency ORDER BY + empty-TTL fallback + no-store
        r_nq = client.get("/v1/noticias-quentes")
        self.assertEqual(r_nq.status_code, 200)
        self.assertEqual(r_nq.headers.get("cache-control"), "no-store, no-cache, must-revalidate")
        body_nq = r_nq.json()
        self.assertEqual(body_nq["source"], "database_recent_fallback")
        self.assertEqual(body_nq["total"], 1)
        self.assertTrue(body_nq["noticias_quentes"][0].get("data_publicacao"))
        self.assertTrue(
            any("ORDER BY updated_at DESC, urgencia_score DESC" in q for q, _ in queries_executadas)
        )

        # 2. /v2/sugestoes-contextuais: cache hit sem _t, cache bypass com _t e refresh=1, sem max-age=60
        r_sug1 = client.get("/v2/sugestoes-contextuais?pais=BR")
        self.assertEqual(r_sug1.status_code, 200)
        self.assertFalse(r_sug1.json()["cached"])
        self.assertEqual(r_sug1.headers.get("cache-control"), "no-store, no-cache, must-revalidate")

        r_sug2 = client.get("/v2/sugestoes-contextuais?pais=BR")
        self.assertTrue(r_sug2.json()["cached"])
        self.assertEqual(r_sug2.headers.get("cache-control"), "no-store, no-cache, must-revalidate")

        r_sug_t = client.get("/v2/sugestoes-contextuais?pais=BR&_t=123456")
        self.assertFalse(r_sug_t.json()["cached"])
        self.assertEqual(r_sug_t.headers.get("cache-control"), "no-store, no-cache, must-revalidate")

        r_sug_ref = client.get("/v2/sugestoes-contextuais?pais=BR&refresh=1")
        self.assertFalse(r_sug_ref.json()["cached"])

        # 3. /v1/atlas/pulso-continental: no-store + ordenação por publishedAt DESC
        r_pc = client.get("/v1/atlas/pulso-continental")
        self.assertEqual(r_pc.status_code, 200)
        self.assertEqual(r_pc.headers.get("cache-control"), "no-store, no-cache, must-revalidate")
        headlines = r_pc.json()["continentes"]["americas"]["headlines"]
        self.assertEqual([h["title"] for h in headlines], ["Recente", "Antiga"])

        # 4. /api/atlas-pais: Atom + RSS, +when:7d, ordena antes de [:14], data ruim -> ""
        atom_xml = """<?xml version="1.0" encoding="utf-8"?>
        <feed xmlns="http://www.w3.org/2005/Atom">
          <entry>
            <title>Noticia Sem Data</title>
            <link href="https://news.test/nodate" />
            <updated>data-invalida</updated>
          </entry>
          <entry>
            <title>Noticia Antiga</title>
            <link href="https://news.test/old" />
            <updated>2026-11-17T08:00:00Z</updated>
          </entry>
          <entry>
            <title>Noticia Mais Nova</title>
            <link href="https://news.test/new" />
            <updated>2026-11-18T12:30:00Z</updated>
          </entry>
        </feed>""".encode("utf-8")

        urls_chamadas = []

        class FakeUrlopenResp:
            def __init__(self, data):
                self._data = data

            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

            def read(self):
                return self._data

        def fake_urlopen(req, timeout=6.0):
            urls_chamadas.append(req.full_url if hasattr(req, "full_url") else str(req))
            return FakeUrlopenResp(atom_xml)

        with patch("urllib.request.urlopen", side_effect=fake_urlopen):
            with patch.object(routes_v2, "_traduzir_lote_rapido_pt", side_effect=lambda t: t):
                r_ap = client.get("/api/atlas-pais?pais=US&nome=United%20States&_t=999")
                r_ap_fb = client.get("/api/atlas-pais?pais=IS&nome=Iceland&_t=999")
        self.assertEqual(r_ap.status_code, 200)
        self.assertEqual(r_ap_fb.status_code, 200)
        self.assertEqual(r_ap.headers.get("cache-control"), "no-store, no-cache, must-revalidate")
        self.assertTrue(
            any(
                "ceid=US%3Aen" in u or "ceid=US:en" in u or "when%3A24h" in u or "when:24h" in u or "when%3A7d" in u or "when:7d" in u
                for u in urls_chamadas
            )
        )
        self.assertTrue(any("when%3A24h" in u or "when:24h" in u for u in urls_chamadas))
        ap_items = r_ap.json()["items"]
        self.assertEqual([i["titleOriginal"] for i in ap_items], ["Noticia Mais Nova", "Noticia Antiga", "Noticia Sem Data"])
        self.assertEqual(ap_items[2]["publishedAt"], "")

        # 5. /api/radar: remove temas_ativos expirados e não carimba cards_feed sem data com updatedAt
        raiz_fake = self.root / "radar_fake"
        (raiz_fake / "data").mkdir(parents=True)
        (raiz_fake / "data" / "vitrine_ia.json").write_text(
            json.dumps(
                {
                    "updatedAt": "2026-11-18T12:00:00Z",
                    "temas_ativos": [
                        {
                            "slug": "tema-expirado",
                            "titulo_tema": "Tema Expirado",
                            "data_publicacao": "2026-11-17T10:00:00Z",
                            "expires_at": "2026-11-18T01:00:00Z",
                        },
                        {
                            "slug": "tema-ativo",
                            "titulo_tema": "Tema Ativo",
                            "data_publicacao": "2026-11-18T11:30:00Z",
                            "expires_at": (agora + timedelta(hours=4)).strftime("%Y-%m-%dT%H:%M:%SZ"),
                        },
                    ],
                }
            ),
            encoding="utf-8",
        )
        (raiz_fake / "data" / "feed_output.json").write_text(
            json.dumps(
                [
                    {
                        "titulo": "Card Feed Sem Data",
                        "fonte_nome": "Veículo X",
                        "fonte_url": "https://x.test/1",
                    }
                ]
            ),
            encoding="utf-8",
        )

        class FakePath:
            def __init__(self, p):
                self._p = Path(p)

            def resolve(self):
                return self

            @property
            def parents(self):
                return (None, raiz_fake)

            def __truediv__(self, other):
                return FakePath(self._p / other)

            def is_file(self):
                return self._p.is_file()

            def read_text(self, *args, **kwargs):
                return self._p.read_text(*args, **kwargs)

        app.dependency_overrides[routes_v2.get_db] = lambda: None
        with patch.object(routes_v2, "Path", FakePath):
            r_rad = client.get("/api/radar?_t=123&refresh=1")
        self.assertEqual(r_rad.status_code, 200)
        rad_items = r_rad.json()["items"]
        self.assertEqual([i["titulo"] for i in rad_items], ["Tema Ativo", "Card Feed Sem Data"])
        self.assertEqual(rad_items[1]["data_publicacao"], "")

    def test_curadoria_api_vitrine_recency_fallback_e_headers(self):
        from curadoria.api import main as cur_main

        agora = datetime.now(timezone.utc)
        queries_cur = []

        class FakeCursor:
            def __init__(self):
                self._rows = []

            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

            def execute(self, sql, params=None):
                sql_str = " ".join(str(sql).split())
                queries_cur.append(sql_str)
                if "WHERE expires_at > NOW()" in sql_str:
                    self._rows = []
                else:
                    self._rows = [
                        {
                            "slug": "cur-recente",
                            "titulo_tema": "Tema Recente",
                            "status": "em_alta",
                            "categoria_primaria": "Economia",
                            "categorias_cruzadas": [],
                            "relevancia_score": 80,
                            "palavras_chave_busca": ["cambio"],
                            "gatilho_vitrine": "G",
                            "sintese_nerd": "S",
                            "created_at": agora - timedelta(hours=2),
                            "updated_at": agora - timedelta(hours=1),
                        }
                    ]

            def fetchall(self):
                return list(self._rows)

        class FakeConn:
            def cursor(self):
                return FakeCursor()

        cur_main.app.dependency_overrides[cur_main.get_db] = lambda: FakeConn()
        try:
            client = TestClient(cur_main.app)
            resp = client.get("/v1/vitrine/em-alta")
            self.assertEqual(resp.status_code, 200)
            self.assertEqual(resp.headers.get("cache-control"), "no-store, no-cache, must-revalidate")
            body = resp.json()
            self.assertTrue(body["stale_fallback"])
            self.assertEqual(body["source"], "api_recency_fallback")
            self.assertEqual(body["temas_ativos"][0]["slug"], "cur-recente")
            self.assertTrue(body["temas_ativos"][0].get("data_publicacao"))
            self.assertTrue(any("ORDER BY updated_at DESC, created_at DESC" in q for q in queries_cur))
        finally:
            cur_main.app.dependency_overrides.clear()

    def test_modelos_gemini_25_e_workflow_curadoria(self):
        from curadoria.agente import analisador as cur_analisador
        from redacao_v2 import orquestrador_editorial, pulso_noticias_quentes

        with patch.dict(
            os.environ,
            {
                "GEMINI_MODEL_PULSO": "",
                "GEMINI_MODEL_EDITORIAL": "",
                "CURADORIA_MODEL": "",
            },
            clear=False,
        ):
            # Reavalia defaults esperados quando env vars não sobrepõem
            self.assertIn("gemini-3.5-flash", pulso_noticias_quentes.MODELOS_PULSO_FALLBACK)
            self.assertIn("gemini-3.5-flash", orquestrador_editorial.MODELOS_EDITORIAL_FALLBACK)
            self.assertIn("gemini-3.5-flash", cur_analisador.MODELOS_FALLBACK)

        self.assertIn("gemini-3.5-flash", pulso_noticias_quentes.MODELOS_PULSO_FALLBACK)
        self.assertIn("gemini-3.5-flash", orquestrador_editorial.MODELOS_EDITORIAL_FALLBACK)
        self.assertIn("gemini-3.5-flash", cur_analisador.MODELOS_FALLBACK)

        wf_text = (Path(__file__).resolve().parents[2] / ".github" / "workflows" / "curadoria.yml").read_text(encoding="utf-8")
        self.assertIn("CURADORIA_DATABASE_URL", wf_text)
        self.assertNotIn("git commit", wf_text)
        self.assertNotIn("git push", wf_text)
        self.assertIn("LEAST(", pulso_noticias_quentes.UPSERT_NOTICIA_QUENTE_SQL)


if __name__ == "__main__":
    unittest.main()
