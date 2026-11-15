"""Testes do Nível 2B: estado em PostgreSQL com fallback para arquivo."""
import json
import os
import tempfile
import unittest
from unittest.mock import patch

from src import estado_db


class TestEstadoDbFallback(unittest.TestCase):
    def test_sem_banco_degrada_para_arquivo(self):
        """Sem URL de banco, a camada de estado não deve levantar exceção."""
        with patch.dict(
            os.environ,
            {"DATABASE_URL": "", "CURADORIA_DATABASE_URL": ""},
            clear=False,
        ):
            self.assertEqual(estado_db.obter_database_url(), "")
            self.assertFalse(estado_db.banco_disponivel())
            self.assertIsNone(estado_db.ler_estado("vitrine_ia"))
            self.assertFalse(estado_db.gravar_estado("vitrine_ia", {"temas_ativos": []}))
            self.assertIsNone(
                estado_db.atualizar_estado("history", lambda atual: atual, default={})
            )

    def test_url_com_placeholder_e_ignorada(self):
        with patch.dict(
            os.environ,
            {
                "DATABASE_URL": "",
                "CURADORIA_DATABASE_URL": "postgresql://user:[YOUR-PASSWORD]@host/db",
            },
            clear=False,
        ):
            self.assertEqual(estado_db.obter_database_url(), "")
            self.assertFalse(estado_db.banco_disponivel())


class TestHistoryArquivo(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.caminho = os.path.join(self.temp_dir.name, "history.json")

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_update_history_uniao_preserva_ids(self):
        import src.publisher as pub

        caminho_original = pub.HISTORY_PATH
        pub.HISTORY_PATH = self.caminho
        try:
            with open(self.caminho, "w", encoding="utf-8") as f:
                json.dump({"processed_ids": ["antigo-1", "antigo-2"]}, f)

            pub.update_history(["novo-1", "antigo-1"])

            with open(self.caminho, "r", encoding="utf-8") as f:
                dados = json.load(f)

            self.assertEqual(
                dados["processed_ids"],
                ["antigo-1", "antigo-2", "novo-1"],
            )
        finally:
            pub.HISTORY_PATH = caminho_original


if __name__ == "__main__":
    unittest.main()
