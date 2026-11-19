#!/usr/bin/env python3
"""
Utilitário de Exportação de Estado: Sincroniza dados do PostgreSQL (Supabase)
para os arquivos estáticos de asset em data/*.json.

Garante paridade entre o banco de dados e os fallbacks servidos pelo edge / CDN.
"""
import json
import os
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

try:
    from dotenv import load_dotenv
    load_dotenv(ROOT_DIR / ".env")
except ImportError:
    pass

import psycopg
from src.estado_db import obter_database_url


def exportar_todos_os_estados():
    db_url = obter_database_url()
    if not db_url:
        print("[ERRO] Nenhuma URL de banco de dados configurada.")
        sys.exit(1)

    data_dir = ROOT_DIR / "data"
    data_dir.mkdir(parents=True, exist_ok=True)

    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            # 1. feed_output
            cur.execute("SELECT payload FROM ai_pipeline_state WHERE chave = 'feed_output'")
            row = cur.fetchone()
            if row and row[0]:
                out_path = data_dir / "feed_output.json"
                out_path.write_text(json.dumps(row[0], ensure_ascii=False, indent=2), encoding="utf-8")
                print(f"[OK] data/feed_output.json exportado ({len(row[0])} cards)")

            # 2. vitrine_ia
            cur.execute("SELECT payload FROM ai_pipeline_state WHERE chave = 'vitrine_ia'")
            row = cur.fetchone()
            if row and row[0]:
                out_path = data_dir / "vitrine_ia.json"
                out_path.write_text(json.dumps(row[0], ensure_ascii=False, indent=2), encoding="utf-8")
                up_at = row[0].get("updatedAt", "desconhecido")
                print(f"[OK] data/vitrine_ia.json exportado (updatedAt: {up_at})")

        # 3. entenda_v2
        try:
            from api.routes_v2 import _sincronizar_espelho_entenda_v2
            snap = _sincronizar_espelho_entenda_v2(conn)
            print(f"[OK] data/entenda_v2.json exportado ({len(snap.get('colunas', []))} colunas)")
        except Exception as exc:
            print(f"[AVISO] Falha ao exportar entenda_v2: {exc}")


if __name__ == "__main__":
    exportar_todos_os_estados()
