#!/usr/bin/env python3
"""Script de Execução Autônoma da IA JUÍZA — Rodando o Mundo.

Executável via GitHub Actions, Cron ou agendador de tarefas:
    python scripts/executar_ia_juiza.py
    python scripts/executar_ia_juiza.py --dry-run
"""
import argparse
import asyncio
import os
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

try:
    from dotenv import load_dotenv
    load_dotenv(ROOT_DIR / ".env")
    load_dotenv(ROOT_DIR / "curadoria" / ".env")
except ImportError:
    pass

from redacao_v2.ia_juiza import executar_sessao_tribunal_noturno_async


def main() -> int:
    parser = argparse.ArgumentParser(description="Execução da IA Juíza — Tribunal Noturno (Rodando o Mundo)")
    parser.add_argument("--dry-run", action="store_true", help="Executa sem persistir no banco nem disparar Discord real")
    args = parser.parse_args()

    print(f"⚖️ Iniciando Sessão Noturna da IA Juíza (dry-run: {args.dry_run})...")
    try:
        acordao = asyncio.run(executar_sessao_tribunal_noturno_async(dry_run=args.dry_run))
        print("✅ Sessão do Tribunal Noturno finalizada com sucesso!")
        print(f"📊 Veredito: {acordao.veredito_geral} | Média Isenção: {acordao.media_isencao}/100")
        print(f"🛠️ Calibrações geradas: {len(acordao.calibracoes_geradas)} | Pontos cegos: {len(acordao.pontos_cegos)}")
        return 0
    except Exception as exc:
        print(f"❌ Erro na execução da IA Juíza: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
