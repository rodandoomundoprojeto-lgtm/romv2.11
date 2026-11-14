"""Testa a conexão com o Supabase e aplica as migrações SQL.

Uso:
    python -m curadoria.db.aplicar_migracao            # testa + aplica
    python -m curadoria.db.aplicar_migracao --check    # só testa a conexão
"""
import argparse
import os
import sys
from pathlib import Path

import psycopg

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
except ImportError:
    pass

MIGRACOES = Path(__file__).resolve().parent / "migrations"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="Só testa a conexão")
    args = parser.parse_args()

    url = os.getenv("CURADORIA_DATABASE_URL", "")
    if not url or "[YOUR-PASSWORD]" in url or "[POOLER-HOST]" in url:
        print("[ERRO] Preencha CURADORIA_DATABASE_URL em curadoria/.env (senha e host do pooler).")
        return 1

    try:
        with psycopg.connect(url, connect_timeout=10, prepare_threshold=None) as conn:
            versao = conn.execute("SELECT version()").fetchone()[0]
            print(f"[OK] Conectado: {versao.split(',')[0]}")
            if args.check:
                return 0
            for arq in sorted(MIGRACOES.glob("*.sql")):
                print(f"[..] Aplicando {arq.name}")
                conn.execute(arq.read_text(encoding="utf-8"))
            conn.commit()
            tabelas = conn.execute(
                "SELECT table_name FROM information_schema.tables "
                "WHERE table_schema='public' AND table_name IN ('ai_curadoria_insights','conteudos')"
            ).fetchall()
            print(f"[OK] Tabelas presentes: {[t[0] for t in tabelas]}")
    except psycopg.OperationalError as e:
        print(f"[ERRO] Falha de conexão: {e}")
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())

