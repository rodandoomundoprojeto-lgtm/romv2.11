"""Aplica a migração 008 (Ajuste de constraints de status para ai_colunas_editoriais e ai_entenda_o_assunto).

Permite soft-delete ('excluido'), 'arquivado' e alinha status editoriais ('aprovado', 'rejeitado').

Uso:
    python scripts/aplicar_migracao_008.py
"""
import os
import sys
from pathlib import Path
from dotenv import load_dotenv

RAIZ = Path(__file__).resolve().parents[1]
load_dotenv(RAIZ / ".env")

MIGRACAO = RAIZ / "migrations" / "008_ajuste_status_colunas_e_entenda.sql"


def main():
    print("=" * 60)
    print("🌍 Rodando o Mundo: Aplicando Migração 008 (STATUS COLUNAS/ENTENDA)")
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
            print("⚡ Aplicando ajustes de check constraints em ai_colunas_editoriais e ai_entenda_o_assunto...")
            conn.execute(sql_content)
            conn.commit()
            print("✅ Migração 008 aplicada com sucesso no PostgreSQL!")
    except Exception as e:
        print(f"❌ Erro ao aplicar migração: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
