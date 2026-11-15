"""Auditoria HTTP assíncrona das fontes cadastradas em `ai_fontes_referencia`.

Verifica se as URLs (RSS, Fontes Primárias e YouTube) estão acessíveis e reporta
eventuais erros 404/403/timeout.
"""
import asyncio
import os
import sys
from pathlib import Path
from dotenv import load_dotenv
import httpx
import psycopg
from psycopg.rows import dict_row

ROOT_DIR = Path(__file__).resolve().parents[1]
load_dotenv(ROOT_DIR / ".env")


async def check_source(client: httpx.AsyncClient, sem: asyncio.Semaphore, f: dict) -> tuple:
    url = f["url"]
    tipo = f["tipo_fonte"]
    async with sem:
        try:
            resp = await client.get(url)
            if resp.status_code == 200:
                return ("OK", f["id"], f["nome"], 200, url)
            if tipo == "youtube_rss" and "channel_id=" in url:
                cid = url.split("channel_id=")[-1].split("&")[0]
                ch_resp = await client.get(f"https://www.youtube.com/channel/{cid}")
                if ch_resp.status_code == 200:
                    return ("YT_OK", f["id"], f["nome"], resp.status_code, cid)
                return ("404", f["id"], f["nome"], ch_resp.status_code, url)
            if resp.status_code == 404:
                return ("404", f["id"], f["nome"], 404, url)
            return ("WARN", f["id"], f["nome"], resp.status_code, url)
        except Exception as e:
            return ("ERR", f["id"], f["nome"], str(e), url)


async def run_audit() -> int:
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        print("ERRO: DATABASE_URL não encontrada no .env")
        return 1

    with psycopg.connect(db_url, row_factory=dict_row, prepare_threshold=None) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id, nome, url, tipo_fonte, ativo FROM ai_fontes_referencia ORDER BY id")
            fontes = cur.fetchall()

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, text/html, */*;q=0.8",
    }

    sem = asyncio.Semaphore(12)
    async with httpx.AsyncClient(headers=headers, timeout=12.0, follow_redirects=True) as client:
        results = await asyncio.gather(*(check_source(client, sem, f) for f in fontes))

    ok_count = 0
    yt_channel_ok = 0
    erros_404 = []
    outros = []

    for status, fid, nome, code, info in results:
        if status == "OK":
            ok_count += 1
        elif status == "YT_OK":
            yt_channel_ok += 1
        elif status == "404":
            erros_404.append((fid, nome, code, info))
            print(f"[404] ID={fid} | {nome} -> {info}", flush=True)
        else:
            outros.append((fid, nome, code, info))
            print(f"[{code}] ID={fid} | {nome} -> {info}", flush=True)

    print("\n================ RESUMO DA AUDITORIA ================", flush=True)
    print(f"Total no banco: {len(fontes)}", flush=True)
    print(f"RSS/Portais 200 OK: {ok_count}", flush=True)
    print(f"Canais YouTube com ID válido (200 OK): {yt_channel_ok}", flush=True)
    print(f"Erros 404 reais (URLs ou Channel IDs inexistentes): {len(erros_404)}", flush=True)
    print(f"Outros bloqueios/WAF (ex: 403): {len(outros)}", flush=True)
    return 0 if len(erros_404) == 0 else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(run_audit()))
