"""
Script idempotente para corrigir URLs e Channel IDs de canais do YouTube
na tabela `ai_fontes_referencia`, com backup prévio em `_backups/BUG-YOUTUBE-404/`.
"""
import json
import os
import sys
from pathlib import Path
from dotenv import load_dotenv
import psycopg
from psycopg.rows import dict_row

ROOT_DIR = Path(__file__).resolve().parents[1]
load_dotenv(ROOT_DIR / ".env")

BACKUP_DIR = ROOT_DIR / "_backups" / "BUG-YOUTUBE-404"
BACKUP_FILE = BACKUP_DIR / "ai_fontes_referencia_backup.json"

CORRECOES_YOUTUBE = [
    {
        "id": 8,
        "nome": "STF - YouTube Oficial",
        "channel_id": "UCsW4QSB1USsu9ouuFUWe4Iw",
        "canal_url": "https://www.youtube.com/@STF_oficial",
    },
    {
        "id": 9,
        "nome": "TSE - YouTube Oficial",
        "channel_id": "UC1kilS1DdyYOEGItHPRukBw",
        "canal_url": "https://www.youtube.com/@justicaeleitoral",
    },
    {
        "id": 10,
        "nome": "Canal Gov / Planalto - YouTube",
        "channel_id": "UCjaWLFTNqLkq3ZY2BJ4NYRg",
        "canal_url": "https://www.youtube.com/@canalgov",
    },
    {
        "id": 11,
        "nome": "TV Senado - YouTube",
        "channel_id": "UCLgti7NuK0RuW9wty-fxPjQ",
        "canal_url": "https://www.youtube.com/@tvsenado",
    },
    {
        "id": 12,
        "nome": "Câmara dos Deputados - YouTube",
        "channel_id": "UC-ZkSRh-7UEuwXJQ9UMCFJA",
        "canal_url": "https://www.youtube.com/@CamaradosDeputadosoficial",
    },
    {
        "id": 47,
        "nome": "Xadrez Verbal (YouTube)",
        "channel_id": "UCsMj2K36ejga547ge5cBscg",
        "canal_url": "https://www.youtube.com/@XadrezVerbal",
    },
    {
        "id": 48,
        "nome": "Petit Journal (YouTube)",
        "channel_id": "UC-g5Ls_uobMiRatAWzhSTqA",
        "canal_url": "https://www.youtube.com/@PetitJournal",
    },
    {
        "id": 49,
        "nome": "Chutando a Escada (YouTube)",
        "channel_id": "UCn_HMLAk7lutYdOYjZB17ow",
        "canal_url": "https://www.youtube.com/@ChutandoaEscada",
    },
    {
        "id": 50,
        "nome": "Foro de Teresina - Revista Piauí (YouTube)",
        "channel_id": "UCq-V8B_t_gUWlAJ5YaJSRzQ",
        "canal_url": "https://www.youtube.com/@revistapiaui",
    },
    {
        "id": 51,
        "nome": "Stock Pickers (YouTube)",
        "channel_id": "UCx7ki_a6KpcvwQLBTz-zquA",
        "canal_url": "https://www.youtube.com/@StockPickers",
    },
    {
        "id": 52,
        "nome": "Os Economistas (YouTube)",
        "channel_id": "UCIX5uq1meeqhtKdBIFwHGWg",
        "canal_url": "https://www.youtube.com/@oseconomistas",
    },
    {
        "id": 59,
        "nome": "Professor HOC",
        "channel_id": "UCkVBx-XpEXAgWHX5-P1hl-A",
        "canal_url": "https://www.youtube.com/@ProfessorHOC",
    },
    {
        "id": 60,
        "nome": "Planeta Novo",
        "channel_id": "UCXDpWoUWeSWu_V1aiozYOGg",
        "canal_url": "https://www.youtube.com/@PlanetaNovo",
    },
    {
        "id": 61,
        "nome": "Prof Ricardo Marcílio",
        "channel_id": "UCT6Imb3GXhF8GmjpIk6y2lg",
        "canal_url": "https://www.youtube.com/@ProfRicardoMarcilio",
    },
    {
        "id": 62,
        "nome": "Jovens de Negócios",
        "channel_id": "UC6pkw1C4ha1cmU9aDJ8OxUw",
        "canal_url": "https://www.youtube.com/@jovensdenegocios",
    },
    {
        "id": 63,
        "nome": "Drew Binsky",
        "channel_id": "UC0Ize0RLIbGdH5x4wI45G-A",
        "canal_url": "https://www.youtube.com/@drewbinsky",
    },
    {
        "id": 64,
        "nome": "Lucas Bigodinho",
        "channel_id": "UC3W3fZG5oGQGGNoBYWwCrTg",
        "canal_url": "https://www.youtube.com/@LucasBigodinho",
    },
    {
        "id": 65,
        "nome": "André Nômade Raiz",
        "channel_id": "UC5sMjGaQJXkQdZTzGkSjYDg",
        "canal_url": "https://www.youtube.com/@andrenomaderaiz",
    },
    {
        "id": 66,
        "nome": "Medo e Delírio em Brasília",
        "channel_id": "UCw_aZuP_zSwoc_hHfuffuWA",
        "canal_url": "https://www.youtube.com/@medoedelirioembrasilia",
    },
    {
        "id": None,
        "nome": "Prof. JeanGrafia | GabaritaGeo",
        "channel_id": "UCv-QXC04JCxklAUQQe9vCuQ",
        "canal_url": "https://www.youtube.com/@gabaritageo",
        "regiao": "Global",
    },
    {
        "id": None,
        "nome": "Canal Top 10",
        "channel_id": "UC9A70zHWT__VE5oWmTg2-xA",
        "canal_url": "https://www.youtube.com/@CanalTop10",
        "regiao": "Global",
    },
]


def main() -> None:
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        print("ERRO: DATABASE_URL não configurada no .env", file=sys.stderr)
        sys.exit(1)

    BACKUP_DIR.mkdir(parents=True, exist_ok=True)

    with psycopg.connect(db_url, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            # 1. Backup preventivo das fontes atuais do YouTube
            cur.execute(
                """
                SELECT * FROM ai_fontes_referencia
                WHERE url ILIKE '%youtube%' OR tipo_fonte = 'youtube_rss'
                ORDER BY id
                """
            )
            atuais = cur.fetchall()
            BACKUP_FILE.write_text(
                json.dumps(atuais, indent=2, ensure_ascii=False, default=str),
                encoding="utf-8",
            )
            print(f"Backup salvo com {len(atuais)} registros em: {BACKUP_FILE}")

            # 2. Aplicar atualizações/inserções em transação
            atualizados = 0
            for item in CORRECOES_YOUTUBE:
                feed_url = f"https://www.youtube.com/feeds/videos.xml?channel_id={item['channel_id']}"
                row = None
                if item.get("id") is not None:
                    cur.execute(
                        """
                        UPDATE ai_fontes_referencia
                        SET url = %s,
                            referencia_condicoes_uso = %s,
                            ativo = TRUE,
                            coleta_permitida = TRUE,
                            politica_uso_status = 'aprovada',
                            revisado_por = 'Correção Bug YouTube 404 (RoM)',
                            revisado_em = NOW()
                        WHERE id = %s
                        RETURNING id, nome, url, referencia_condicoes_uso;
                        """,
                        (feed_url, item["canal_url"], item["id"]),
                    )
                    row = cur.fetchone()
                else:
                    cur.execute(
                        """
                        UPDATE ai_fontes_referencia
                        SET nome = %s,
                            referencia_condicoes_uso = %s,
                            ativo = TRUE,
                            coleta_permitida = TRUE,
                            politica_uso_status = 'aprovada',
                            revisado_por = 'Equilíbrio YouTube Radar (RoM)',
                            revisado_em = NOW()
                        WHERE url = %s
                        RETURNING id, nome, url, referencia_condicoes_uso;
                        """,
                        (item["nome"], item["canal_url"], feed_url),
                    )
                    row = cur.fetchone()
                    if not row:
                        cur.execute(
                            """
                            INSERT INTO ai_fontes_referencia (
                                nome, url, pais_iso, regiao, idioma, tipo_fonte, cadencia,
                                peso_confianca, politica_uso_status, coleta_permitida, ativo,
                                armazenamento_permitido, exibicao_permitida, referencia_condicoes_uso,
                                revisado_por, revisado_em
                            )
                            VALUES (
                                %s, %s, 'BR', %s, 'pt', 'youtube_rss', 'ciclo_3h',
                                5, 'aprovada', TRUE, TRUE,
                                'apenas_metadados', 'manchete_sintese_e_link', %s,
                                'Equilíbrio YouTube Radar (RoM)', NOW()
                            )
                            RETURNING id, nome, url, referencia_condicoes_uso;
                            """,
                            (item["nome"], feed_url, item.get("regiao", "Global"), item["canal_url"]),
                        )
                        row = cur.fetchone()

                if row:
                    atualizados += 1
                    print(f"[OK] ID={row['id']} | {row['nome']} -> {row['url']} | Canal={row['referencia_condicoes_uso']}")
                else:
                    print(f"[AVISO] ID={item.get('id')} ({item['nome']}) não encontrado no banco.")

            conn.commit()
            print(f"\nConcluído! {atualizados} fontes do YouTube atualizadas no banco.")


if __name__ == "__main__":
    main()
