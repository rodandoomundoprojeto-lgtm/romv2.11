"""
Testes automatizados para integridade e preservação do horário de publicação no Radar Editorial.
Atende aos requisitos R1 e R2 e Critérios de Aceite de Estabilidade e Integridade do Horário.
"""
import json
import os
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import MagicMock

from redacao_v2.pulso_noticias_quentes import salvar_snapshot_vitrine_pulso
from src.publisher import publish_cards, sortir_cards_rodizio_amplo


class TestRadarPublicationTime(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.caminho_vitrine = Path(self.temp_dir.name) / "vitrine_ia.json"
        self.caminho_feed = Path(self.temp_dir.name) / "feed_output.json"

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_preservacao_timestamp_ciclos_repetidos_pulso(self):
        """
        R1 / Critério 1 & 3: Ao disparar novos ciclos de ingestão/atualização de pulso,
        uma notícia pré-existente mantém seu timestamp de publicação original inalterado.
        """
        timestamp_original = "2026-11-15T09:15:00Z"

        # 1º Ciclo: Notícia A ingressa pela primeira vez na cobertura
        lote_1 = {
            "batch_id": "20261115-0915",
            "noticias_quentes": [
                {
                    "slug": "noticia-geopolitica-alfa",
                    "titulo_curto": "Acordo comercial estratégico é firmado entre nações",
                    "resumo_pulso": "Primeira análise sobre o acordo bilateral de cooperação.",
                    "categoria": "Geopolitica_Relacoes",
                    "data_publicacao": timestamp_original,
                    "relevancia_score": 90,
                    "urgencia_score": 88,
                    "paises_envolvidos": ["BR", "US"],
                    "fontes_urls": ["https://fonte.com/acordo"],
                }
            ],
        }

        salvar_snapshot_vitrine_pulso(lote_1, caminho=self.caminho_vitrine)

        with open(self.caminho_vitrine, "r", encoding="utf-8") as f:
            snap_1 = json.load(f)

        tema_1 = snap_1["temas_ativos"][0]
        self.assertEqual(tema_1["slug"], "noticia-geopolitica-alfa")
        self.assertEqual(tema_1["data_publicacao"], timestamp_original)

        # 2º Ciclo (30 minutos depois): Nova coleta inclui a notícia A novamente + Notícia B nova
        timestamp_ciclo_2 = "2026-11-15T09:45:00Z"
        lote_2 = {
            "batch_id": "20261115-0945",
            "noticias_quentes": [
                {
                    "slug": "noticia-geopolitica-alfa",
                    "titulo_curto": "Acordo comercial estratégico é firmado entre nações",
                    "resumo_pulso": "Atualização factual com declarações de ministros.",
                    "categoria": "Geopolitica_Relacoes",
                    # Suponha que o lote novo venha com data_publicacao do momento do coletor
                    "data_publicacao": timestamp_ciclo_2,
                    "relevancia_score": 92,
                    "urgencia_score": 85,
                    "paises_envolvidos": ["BR", "US"],
                    "fontes_urls": ["https://fonte.com/acordo-v2"],
                },
                {
                    "slug": "noticia-economia-beta",
                    "titulo_curto": "Banco Central anuncia nova taxa de câmbio",
                    "resumo_pulso": "Repercussão imediata nos índices financeiros.",
                    "categoria": "Economia_Comercio",
                    "data_publicacao": timestamp_ciclo_2,
                    "relevancia_score": 88,
                    "urgencia_score": 82,
                    "paises_envolvidos": ["BR"],
                    "fontes_urls": ["https://fonte.com/economia"],
                },
            ],
        }

        salvar_snapshot_vitrine_pulso(lote_2, caminho=self.caminho_vitrine)

        with open(self.caminho_vitrine, "r", encoding="utf-8") as f:
            snap_2 = json.load(f)

        temas_por_slug_2 = {t["slug"]: t for t in snap_2["temas_ativos"]}

        # Verificação crítica: Notícia A DEVE preservar o timestamp original das 09h15
        self.assertEqual(
            temas_por_slug_2["noticia-geopolitica-alfa"]["data_publicacao"],
            timestamp_original,
            "O timestamp de notícia pré-existente não pode ser sobrescrito pelo horário da coleta subsequente!"
        )
        # Notícia B recebe seu timestamp das 09h45
        self.assertEqual(
            temas_por_slug_2["noticia-economia-beta"]["data_publicacao"],
            timestamp_ciclo_2,
        )

        # 3º Ciclo (60 minutos depois): Outro lote é processado
        timestamp_ciclo_3 = "2026-11-15T10:15:00Z"
        lote_3 = {
            "batch_id": "20261115-1015",
            "noticias_quentes": [
                {
                    "slug": "noticia-geopolitica-alfa",
                    "titulo_curto": "Acordo comercial estratégico é firmado entre nações",
                    "resumo_pulso": "Acordo entra em fase de ratificação parlamentar.",
                    "categoria": "Geopolitica_Relacoes",
                    "data_publicacao": timestamp_ciclo_3,
                }
            ],
        }

        salvar_snapshot_vitrine_pulso(lote_3, caminho=self.caminho_vitrine)

        with open(self.caminho_vitrine, "r", encoding="utf-8") as f:
            snap_3 = json.load(f)

        temas_por_slug_3 = {t["slug"]: t for t in snap_3["temas_ativos"]}
        # Continua rigorosamente inalterado após 3 ciclos
        self.assertEqual(
            temas_por_slug_3["noticia-geopolitica-alfa"]["data_publicacao"],
            timestamp_original,
        )

    def test_preservacao_timestamp_publisher_cards(self):
        """
        Verifica que publish_cards preserva data_publicacao original
        de itens já presentes em feed_output.json.
        """
        orig_feed = Path(self.temp_dir.name) / "test_feed_output.json"
        ts_antigo = "2026-11-15T08:00:00+00:00"

        # Mock FEED_OUTPUT_PATH em src.publisher
        import src.publisher as pub
        old_feed_path = pub.FEED_OUTPUT_PATH
        pub.FEED_OUTPUT_PATH = str(orig_feed)

        try:
            # Estado inicial
            initial_cards = [
                {
                    "titulo": "Reportagem Especial sobre Energias Renováveis",
                    "resumo": "Análise técnica do setor eólico.",
                    "analise": "Impacto na matriz energética.",
                    "categoria": "geopolitica",
                    "fonte_nome": "Veículo A",
                    "fonte_url": "https://veiculoa.com/energia",
                    "data_publicacao": ts_antigo,
                }
            ]
            with open(orig_feed, "w", encoding="utf-8") as f:
                json.dump(initial_cards, f)

            # Nova tentativa de publicação do mesmo card com timestamp atual
            ts_novo = "2026-11-15T14:30:00+00:00"
            tentativa = [
                {
                    "titulo": "Reportagem Especial sobre Energias Renováveis",
                    "resumo": "Resumo atualizado.",
                    "analise": "Análise atualizada.",
                    "categoria": "geopolitica",
                    "fonte_nome": "Veículo A",
                    "fonte_url": "https://veiculoa.com/energia",
                    "data_publicacao": ts_novo,
                }
            ]

            novos = pub.publish_cards(tentativa)
            self.assertEqual(novos, 0, "Card já existente não deve ser re-publicado como novo.")

            with open(orig_feed, "r", encoding="utf-8") as f:
                resultado = json.load(f)

            self.assertEqual(len(resultado), 1)
            self.assertEqual(
                resultado[0]["data_publicacao"],
                ts_antigo,
                "A data de publicação original do card deve persistir inalterada."
            )
        finally:
            pub.FEED_OUTPUT_PATH = old_feed_path

    def test_estabilidade_horario_rota_radar_v2(self):
        """
        Critério 1: Ao recarregar o Radar Editorial (inclusive com refresh=1 e _t=...),
        a notícia preexistente não tem seu horário de publicação sobrescrito pelo horário atual da requisição.
        """
        from api.routes_v2 import obter_feed_radar

        mock_response = MagicMock()
        mock_response.headers = {}

        # Executa requisição com parâmetro de refresh e cache-busting
        res1 = obter_feed_radar(response=mock_response, _t="11111111", refresh="1")
        self.assertTrue(res1["ok"])
        items1 = res1["items"]
        self.assertGreater(len(items1), 0)

        # Mapeia os timestamps da primeira chamada
        timestamps_1 = {it["titulo"]: it.get("data_publicacao") for it in items1}

        # Confirma que há tanto itens de pulso V2 quanto do feed
        origens_v2 = [it.get("origem_v2") for it in items1]
        self.assertIn(True, origens_v2, "O radar híbrido deve conter itens de pulso V2 da vitrine.")
        self.assertIn(False, origens_v2, "O radar híbrido deve conter itens do feed_output.")

        # Simula recarregamento subsequente com novo timestamp de cache-busting
        res2 = obter_feed_radar(response=mock_response, _t="22222222", refresh="1")
        self.assertTrue(res2["ok"])
        items2 = res2["items"]

        # O carimbo editorial de atualização do radar deve ser consistente entre recarregamentos
        self.assertEqual(res1["atualizado_em"], res2["atualizado_em"])

        timestamps_2 = {it["titulo"]: it.get("data_publicacao") for it in items2}

        # Cada notícia preexistente deve manter exatamente o mesmo horário de publicação
        for titulo, ts1 in timestamps_1.items():
            if titulo in timestamps_2:
                ts2 = timestamps_2[titulo]
                self.assertEqual(
                    ts1, ts2,
                    f"Notícia '{titulo}' teve seu horário alterado de {ts1} para {ts2} ao recarregar!"
                )

    def test_preservacao_timestamp_curadoria_pipeline(self):
        """
        Garante que a função salvar_snapshot_vitrine do pipeline de curadoria
        preserve a data_publicacao original ao gerar novos snapshots.
        """
        import curadoria.pipeline as pipe
        from curadoria.agente.schemas import CuradoriaPayload

        old_snapshot_path = pipe.SNAPSHOT_VITRINE
        pipe.SNAPSHOT_VITRINE = self.caminho_vitrine

        try:
            ts_inicial = "2026-11-15T08:00:00Z"
            # Cria snapshot inicial com data_publicacao
            snapshot_inicial = {
                "ok": True,
                "cached": False,
                "source": "snapshot",
                "updatedAt": ts_inicial,
                "batch_id": "batch-01",
                "temas_ativos": [
                    {
                        "slug": "tema-curadoria-01",
                        "titulo_tema": "Tema Curado Inicial",
                        "categoria_primaria": "Geopolitica_Radar",
                        "relevancia_score": 90,
                        "data_publicacao": ts_inicial,
                        "updated_at": ts_inicial,
                    }
                ],
                "noticias_quentes": [
                    {
                        "slug": "nq-01",
                        "titulo_curto": "Notícia Quente Preservada",
                    }
                ]
            }
            with open(self.caminho_vitrine, "w", encoding="utf-8") as f:
                json.dump(snapshot_inicial, f)

            # Executa salvar_snapshot_vitrine com novo payload contendo o mesmo slug
            payload_novo = CuradoriaPayload.model_validate({
                "batch_id": "batch-02",
                "insights": [
                    {
                        "slug": "tema-curadoria-01",
                        "titulo_tema": "Tema Curado com Título Atualizado",
                        "status": "em_alta",
                        "categoria_primaria": "Economia",
                        "categorias_cruzadas": ["Geopolitica_Radar"],
                        "relevancia_score": 95,
                        "ttl_horas": 48,
                        "palavras_chave_busca": ["economia", "mercados", "cambio", "investimentos"],
                        "gatilho_vitrine": "Análise econômica detalhada",
                        "sintese_nerd": "Síntese dos impactos financeiros",
                        "sugestao_pauta_gap": {
                            "titulo_seo": "Análise econômica detalhada sobre mercados e câmbio",
                            "angulo_editorial": "Avaliar o impacto direto nos investimentos e inflação.",
                            "formato_ideal": "Guia Explicativo",
                        },
                    }
                ]
            })

            pipe.salvar_snapshot_vitrine(payload_novo)

            with open(self.caminho_vitrine, "r", encoding="utf-8") as f:
                snap_pos = json.load(f)

            tema_resultante = snap_pos["temas_ativos"][0]
            self.assertEqual(tema_resultante["slug"], "tema-curadoria-01")
            # A data_publicacao original DEVE ser mantida intacta
            self.assertEqual(
                tema_resultante["data_publicacao"],
                ts_inicial,
                "A data_publicacao original deve ser preservada entre execuções do pipeline de curadoria!"
            )
            # Noticias quentes existentes devem ser preservadas
            self.assertIn("noticias_quentes", snap_pos)
            self.assertEqual(len(snap_pos["noticias_quentes"]), 1)
        finally:
            pipe.SNAPSHOT_VITRINE = old_snapshot_path


if __name__ == "__main__":
    unittest.main()
