"""Aplica a migração 009 (Adiciona coluna pais_principal em ai_noticias_quentes).

Permite definir e rotacionar o país principal do ticker de notícias quentes.

Uso:
    python scripts/aplicar_migracao_009.py
"""
import os
import sys
from pathlib import Path
from dotenv import load_dotenv

RAIZ = Path(__file__).resolve().parents[1]
load_dotenv(RAIZ / ".env")

MIGRACAO = RAIZ / "migrations" / "009_adicionar_pais_principal_noticias_quentes.sql"


def main():
    print("=" * 60)
    print("🌍 Rodando o Mundo: Aplicando Migração 009 (PAIS PRINCIPAL NOTICIAS QUENTES)")
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
            print("⚡ Adicionando coluna pais_principal em ai_noticias_quentes...")
            conn.execute(sql_content)
            conn.commit()
            print("✅ Migração 009 aplicada com sucesso no PostgreSQL!")
    except Exception as e:
        print(f"❌ Erro ao aplicar migração: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
