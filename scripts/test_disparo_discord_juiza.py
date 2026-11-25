#!/usr/bin/env python3
"""Teste de Disparo do Acórdão da IA Juíza para o Discord."""
import json
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

from redacao_v2.schemas import AcordaoNoturnoPayload
from src.notifier import notificar_acordao_juiza_discord

def main():
    caminho_acordao = ROOT_DIR / "data" / "ultimo_acordao_juiza.json"
    if not caminho_acordao.exists():
        print(f"Arquivo {caminho_acordao} não encontrado.")
        return 1

    dados = json.loads(caminho_acordao.read_text(encoding="utf-8"))
    acordao = AcordaoNoturnoPayload.model_validate(dados)

    webhook_url = (
        os.getenv("DISCORD_WEBHOOK_JUIZA")
        or os.getenv("DISCORD_WEBHOOK_URL")
        or os.getenv("DISCORD_WEBHOOK_RADAR")
        or ""
    ).strip()

    print(f"Enviando Acórdão da IA Juíza ({acordao.batch_data}) para o Discord...")
    print(f"Webhook configurado: {'SIM (' + webhook_url[:35] + '...)' if webhook_url else 'NÃO'}")

    sucesso = notificar_acordao_juiza_discord(acordao)
    if sucesso:
        print("✅ Embed da IA Juíza disparado com sucesso para o Discord!")
        return 0
    else:
        print("⚠️ Falha ao disparar para o Discord (verifique se DISCORD_WEBHOOK_URL está definido no .env).")
        return 1

if __name__ == "__main__":
    sys.exit(main())
