import os
import sys
import psycopg
from psycopg.rows import dict_row
from datetime import datetime, timezone

# Try to find database URL
db_url = os.environ.get('DATABASE_URL') or os.environ.get('CURADORIA_DATABASE_URL') or ''
print(f"Database URL: {db_url[:50]}..." if db_url else "No DB URL found")

if not db_url:
    # List environment variables that might contain DB info
    for k, v in os.environ.items():
        if 'db' in k.lower() or 'database' in k.lower() or 'postgres' in k.lower():
            print(f"{k}: {v[:100]}" if v else f"{k}: (empty)")
    sys.exit(1)

try:
    with psycopg.connect(db_url, connect_timeout=10, row_factory=dict_row, prepare_threshold=None) as conn:
        # Check active news (expires_at > NOW)
        with conn.cursor() as cur:
            cur.execute("""
                SELECT slug, titulo_curto, categoria, urgencia_score, relevancia_score, 
                       expires_at, data_publicacao, created_at, updated_at, veiculos_origem
                FROM ai_noticias_quentes
                WHERE expires_at > NOW()
                ORDER BY updated_at DESC, urgencia_score DESC
                LIMIT 20;
            """)
            rows = cur.fetchall()
            print(f'\nTotal active news (expires_at > NOW()): {len(rows)}')
            print('---')
            for r in rows:
                print(f'Slug: {r.get("slug")}')
                print(f'  Título: {r.get("titulo_curto")}')
                print(f'  Categoria: {r.get("categoria")}')
                print(f'  Urgência: {r.get("urgencia_score")} | Relevância: {r.get("relevancia_score")}')
                print(f'  Vence em: {r.get("expires_at")}')
                print(f'  Data Publicação: {r.get("data_publicacao")}')
                print(f'  Veículos: {r.get("veiculos_origem")}')
                print()
except Exception as e:
    print(f'Error: {type(e).__name__}: {e}')
    import traceback
    traceback.print_exc()