"""Seed e migração dos Dossiês (Permanentes + Especiais).

Uso:
    python scripts/seed_dossies.py --json                            # só gera data/dossies.json (espelho offline)
    python scripts/seed_dossies.py --migrate --seed                  # aplica migrações e insere apenas novos slugs (DO NOTHING)
    python scripts/seed_dossies.py --migrate --seed --safe           # explícito: preserva edições manuais via Dashboard
    python scripts/seed_dossies.py --seed --force-overwrite          # sobrescreve registros existentes (DO UPDATE)
"""
import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ / "scripts"))

from dossies_catalogo import ESPECIAIS, PERMANENTES  # noqa: E402

MIGRACAO = RAIZ / "migrations" / "003_dossies_permanentes_especiais.sql"
MIGRACAO_004 = RAIZ / "migrations" / "004_dossie_materias_recalculo_atomico.sql"
SAIDA_JSON = RAIZ / "data" / "dossies.json"
BRT = "-03:00"


def _ts(dia: str, fim: bool = False) -> str:
    hora = "23:59:59" if fim else "00:00:00"
    return f"{dia}T{hora}{BRT}"


def montar_registros() -> list:
    regs = []
    ordem = 0
    for slug, titulo, icone, cat, desc, kws, paises, rota in PERMANENTES:
        ordem += 1
        regs.append({
            "slug": slug, "titulo": titulo, "subtitulo": desc, "tipo": "permanente",
            "categoria": cat, "icone_ou_bandeira": icone,
            "data_inicio": None, "data_fim": None,
            "regras_classificacao": {"palavras_chave": kws, "paises": paises},
            "meta_info": None, "rota": rota, "ordem": ordem,
        })
    for slug, titulo, icone, desc, ini, fim, meta, kws in ESPECIAIS:
        ordem += 1
        regs.append({
            "slug": slug, "titulo": titulo, "subtitulo": desc, "tipo": "especial",
            "categoria": "Eventos", "icone_ou_bandeira": icone,
            "data_inicio": _ts(ini), "data_fim": _ts(fim, True),
            "regras_classificacao": {"palavras_chave": kws, "paises": []},
            "meta_info": meta, "rota": None, "ordem": ordem,
        })
    return regs


def gerar_json(regs: list) -> None:
    payload = {"gerado_em": datetime.now(timezone.utc).isoformat(), "dossies": regs}
    SAIDA_JSON.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[seed] {len(regs)} dossiês -> {SAIDA_JSON}")


def conectar():
    import psycopg
    from dotenv import load_dotenv
    load_dotenv(RAIZ / ".env")
    url = (os.getenv("DATABASE_URL") or os.getenv("CURADORIA_DATABASE_URL") or "").strip()
    if not url:
        raise SystemExit("DATABASE_URL ausente.")
    return psycopg.connect(url, prepare_threshold=None, connect_timeout=10)


INSERT_SAFE = """
INSERT INTO dossies (slug, titulo, subtitulo, tipo, categoria, icone_ou_bandeira, data_inicio, data_fim,
                     regras_classificacao, meta_info, rota, ordem)
VALUES (%(slug)s, %(titulo)s, %(subtitulo)s, %(tipo)s, %(categoria)s, %(icone_ou_bandeira)s, %(data_inicio)s,
        %(data_fim)s, %(regras)s, %(meta_info)s, %(rota)s, %(ordem)s)
ON CONFLICT (slug) DO NOTHING;
"""

UPSERT_OVERWRITE = """
INSERT INTO dossies (slug, titulo, subtitulo, tipo, categoria, icone_ou_bandeira, data_inicio, data_fim,
                     regras_classificacao, meta_info, rota, ordem)
VALUES (%(slug)s, %(titulo)s, %(subtitulo)s, %(tipo)s, %(categoria)s, %(icone_ou_bandeira)s, %(data_inicio)s,
        %(data_fim)s, %(regras)s, %(meta_info)s, %(rota)s, %(ordem)s)
ON CONFLICT (slug) DO UPDATE SET
    titulo = EXCLUDED.titulo, subtitulo = EXCLUDED.subtitulo, tipo = EXCLUDED.tipo,
    categoria = EXCLUDED.categoria, icone_ou_bandeira = EXCLUDED.icone_ou_bandeira,
    data_inicio = EXCLUDED.data_inicio, data_fim = EXCLUDED.data_fim,
    regras_classificacao = EXCLUDED.regras_classificacao, meta_info = EXCLUDED.meta_info,
    rota = EXCLUDED.rota, ordem = EXCLUDED.ordem, ultima_atualizacao = NOW();
"""


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--migrate", action="store_true")
    ap.add_argument("--seed", action="store_true")
    modo = ap.add_mutually_exclusive_group()
    modo.add_argument("--safe", action="store_true", help="Modo padrão: ON CONFLICT DO NOTHING (preserva edições do Dashboard).")
    modo.add_argument("--force-overwrite", action="store_true", help="Sobrescreve dossiês existentes via ON CONFLICT DO UPDATE.")
    args = ap.parse_args()

    regs = montar_registros()
    assert len([r for r in regs if r["tipo"] == "permanente"]) == 24
    assert len([r for r in regs if r["tipo"] == "especial"]) == 12
    if args.json or args.seed:
        gerar_json(regs)
    if args.migrate or args.seed:
        from psycopg.types.json import Jsonb
        with conectar() as conn:
            if args.migrate:
                conn.execute(MIGRACAO.read_text(encoding="utf-8"))
                print("[seed] migração 003 aplicada")
                conn.execute(MIGRACAO_004.read_text(encoding="utf-8"))
                print("[seed] migração 004 aplicada (trigger veiculos_unicos + elegíveis ao_vivo)")
            if args.seed:
                query = UPSERT_OVERWRITE if args.force_overwrite else INSERT_SAFE
                modo_label = "upsertados (force-overwrite)" if args.force_overwrite else "inseridos (safe / DO NOTHING)"
                with conn.cursor() as cur:
                    for r in regs:
                        cur.execute(query, {**r, "regras": Jsonb(r["regras_classificacao"])})
                print(f"[seed] {len(regs)} dossiês processados — modo: {modo_label}")


if __name__ == "__main__":
    main()
