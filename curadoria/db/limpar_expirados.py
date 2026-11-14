"""Remove insights expirados há mais de 30 dias da tabela `ai_curadoria_insights`.

Uso:
    python -m curadoria.db.limpar_expirados
"""
import os
import sys
from pathlib import Path

import psycopg

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
except ImportError:
    pass


def main() -> int:
    url = os.getenv("CURADORIA_DATABASE_URL", "")
    if not url:
        print("[ERRO] CURADORIA_DATABASE_URL não configurada.")
        return 1

    with psycopg.connect(url, connect_timeout=10, prepare_threshold=None) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                DELETE FROM ai_curadoria_insights
                WHERE expires_at < NOW() - INTERVAL '30 days'
                RETURNING slug;
                """
            )
            removidos = [r[0] for r in cur.fetchall()]
            conn.commit()

    print(f"[limpeza] {len(removidos)} insights expirados há >30 dias removidos.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
