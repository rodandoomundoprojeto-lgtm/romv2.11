"""Script de saneamento e atualização de URLs com erro (404/405/403) em `ai_fontes_referencia`.

Atualiza os Channel IDs corretos do YouTube e as URLs canônicas de feeds RSS governamentais.
Idempotente: pode ser executado múltiplas vezes com segurança.
"""
import os
import sys
from pathlib import Path
from dotenv import load_dotenv
import psycopg
from psycopg.rows import dict_row

ROOT_DIR = Path(__file__).resolve().parents[1]
load_dotenv(ROOT_DIR / ".env")

ATUALIZACOES_FONTES = [
    # (id_ou_nome_busca, nova_url, nova_referencia_opcional)
    ("STF - YouTube Oficial", "https://www.youtube.com/feeds/videos.xml?channel_id=UCsW4QSB1USsu9ouuFUWe4Iw", "https://www.youtube.com/@STF_oficial"),
    ("TSE - YouTube Oficial", "https://www.youtube.com/feeds/videos.xml?channel_id=UC1kilS1DdyYOEGItHPRukBw", "https://www.youtube.com/@justicaeleitoral"),
    ("Canal Gov / Planalto - YouTube", "https://www.youtube.com/feeds/videos.xml?channel_id=UCjaWLFTNqLkq3ZY2BJ4NYRg", "https://www.youtube.com/@canalgov"),
    ("Petit Journal (YouTube)", "https://www.youtube.com/feeds/videos.xml?channel_id=UC-g5Ls_uobMiRatAWzhSTqA", None),
    ("Prof Ricardo Marcílio", "https://www.youtube.com/feeds/videos.xml?channel_id=UCT6Imb3GXhF8GmjpIk6y2lg", None),
    ("André Nômade Raiz", "https://www.youtube.com/feeds/videos.xml?channel_id=UCTUkOhJTsv868_efzbyeTKA", None),
    ("TSE Notícias", "https://www.tse.jus.br/noticias-em-rss", None),
    ("Agência Gov (Planalto)", "https://agenciabrasil.ebc.com.br/rss/politica/feed.xml", None),
    ("Agência Câmara", "https://www.camara.leg.br/noticias/rss", None),
    ("White House Briefing Room", "https://www.whitehouse.gov/briefings-statements/feed/", None),
]


def main() -> int:
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        print("ERRO: DATABASE_URL não encontrada no .env")
        return 1

    atualizadas = 0
    with psycopg.connect(db_url, row_factory=dict_row, prepare_threshold=None) as conn:
        with conn.cursor() as cur:
            for nome, nova_url, nova_ref in ATUALIZACOES_FONTES:
                # Verifica se a nova URL já existe em outro registro para evitar UniqueViolation
                cur.execute("SELECT id, nome FROM ai_fontes_referencia WHERE url = %s", (nova_url,))
                existente = cur.fetchone()

                cur.execute("SELECT id, url FROM ai_fontes_referencia WHERE nome = %s", (nome,))
                alvo = cur.fetchone()

                if not alvo:
                    print(f"[SKIP] Fonte '{nome}' não encontrada no banco.")
                    continue

                if existente and existente["id"] != alvo["id"]:
                    # Se já existe a URL correta em outro registro, remove o registro antigo quebrado
                    print(f"[MERGE] URL '{nova_url}' já existe no ID={existente['id']}. Desativando/removendo duplicata ID={alvo['id']} ({nome}).")
                    cur.execute("DELETE FROM ai_fontes_referencia WHERE id = %s", (alvo["id"],))
                    atualizadas += 1
                    continue

                if alvo["url"] == nova_url:
                    print(f"[OK] '{nome}' (ID={alvo['id']}) já está com a URL correta.")
                    continue

                if nova_ref:
                    cur.execute(
                        """
                        UPDATE ai_fontes_referencia
                        SET url = %s, referencia_condicoes_uso = %s, revisado_em = NOW()
                        WHERE id = %s
                        """,
                        (nova_url, nova_ref, alvo["id"]),
                    )
                else:
                    cur.execute(
                        """
                        UPDATE ai_fontes_referencia
                        SET url = %s, revisado_em = NOW()
                        WHERE id = %s
                        """,
                        (nova_url, alvo["id"]),
                    )
                print(f"[UPDATED] ID={alvo['id']} | {nome}: {alvo['url']} -> {nova_url}")
                atualizadas += 1

        conn.commit()
    print(f"\nTotal de registros atualizados/saneados: {atualizadas}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
