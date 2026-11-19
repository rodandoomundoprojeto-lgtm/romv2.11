#!/usr/bin/env python3
"""Utilitário de Teste de Disparo Multi-Canal do Discord (RoM V2)."""
import os
import sys
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

load_dotenv()
from src.notifier import send_discord_webhook, send_discord_system_alert


def testar_todos_os_canais():
    print("\n" + "=" * 60)
    print("🚀 DISPARANDO TESTES EM TODOS OS CANAIS DO DISCORD")
    print("=" * 60 + "\n")

    # 1. Alertas Críticos
    print("1️⃣  Canal CRÍTICO...")
    ok_critico = send_discord_system_alert(
        "🚨 [TESTE] Canal de Alertas Críticos Conectado",
        "Este canal receberá alertas imediatos se o banco cair, se houver falha de deploy no Netlify ou erros críticos nos pipelines.",
        nivel="critico"
    )
    print("   -> Status:", "✅ Entregue com sucesso!" if ok_critico else "❌ Falha no envio")

    # 2. Radar de Notícias
    print("\n2️⃣  Canal RADAR...")
    card_radar = {
        "titulo": "📡 [TESTE] Radar de Notícias em Tempo Real",
        "resumo": "Canal conectado para receber manchetes quentes e novos cards indexados no feed a cada 30 minutos.",
        "analise": "Cobertura contínua de geopolítica, economia, política e tendências internacionais.",
        "categoria": "geopolitica",
        "fonte_nome": "RoM Radar 30m",
        "fonte_url": "https://rodandoomundo.com.br"
    }
    ok_radar = send_discord_webhook(card_radar, canal="radar")
    print("   -> Status:", "✅ Entregue com sucesso!" if ok_radar else "❌ Falha no envio")

    # 3. Curadoria Editorial
    print("\n3️⃣  Canal EDITORIAL...")
    card_editorial = {
        "titulo": "✍️ [TESTE] Redação Editorial & Colunas Aprofundadas",
        "resumo": "Canal conectado para receber análises produzidas pelos 4 agentes, dossiês geopolíticos e checagens factuais.",
        "analise": "Sínteses críticas completas com nota de isenção editorial e contexto histórico.",
        "categoria": "cultura",
        "fonte_nome": "Redação RoM",
        "fonte_url": "https://rodandoomundo.com.br"
    }
    ok_editorial = send_discord_webhook(card_editorial, canal="editorial")
    print("   -> Status:", "✅ Entregue com sucesso!" if ok_editorial else "❌ Falha no envio")

    print("\n" + "=" * 60)
    print("🎉 Testes de canais concluídos! Verifique seu servidor no Discord.")
    print("=" * 60 + "\n")


if __name__ == "__main__":
    testar_todos_os_canais()
