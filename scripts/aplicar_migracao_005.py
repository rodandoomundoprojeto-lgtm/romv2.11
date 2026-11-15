"""Aplica a migração 005 (ATLAS-VIVO: Cache Vivo por País, Pulso Continental e Tradução).

Uso:
    python scripts/aplicar_migracao_005.py
"""
import os
import sys
from pathlib import Path
from dotenv import load_dotenv

RAIZ = Path(__file__).resolve().parents[1]
load_dotenv(RAIZ / ".env")

MIGRACAO = RAIZ / "migrations" / "005_atlas_vivo_cache_e_pulso.sql"


def main():
    print("=" * 60)
    print("🌍 Rodando o Mundo: Aplicando Migração 005 (ATLAS-VIVO)")
    print("=" * 60)

    url = (os.getenv("DATABASE_URL") or os.getenv("CURADORIA_DATABASE_URL") or "").strip()
    if not url:
        print("❌ DATABASE_URL ou CURADORIA_DATABASE_URL não encontrada no .env")
        sys.exit(1)

    try:
        import psycopg
    except ImportError:
        print("❌ psycopg não instalado. Execute: pip install psycopg[binary]")
        sys.exit(1)

    if not MIGRACAO.is_file():
        print(f"❌ Arquivo SQL não encontrado: {MIGRACAO}")
        sys.exit(1)

    sql_content = MIGRACAO.read_text(encoding="utf-8")

    print("🔌 Conectando ao PostgreSQL...")
    try:
        with psycopg.connect(url, prepare_threshold=None, connect_timeout=15) as conn:
            print("⚡ Executando DDL das tabelas atlas_pais_noticias, atlas_pulso_continental e atlas_traducao_cache...")
            conn.execute(sql_content)
            print("✅ Migração 005 aplicada com sucesso no PostgreSQL!")
    except Exception as e:
        print(f"❌ Erro ao aplicar migração: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
