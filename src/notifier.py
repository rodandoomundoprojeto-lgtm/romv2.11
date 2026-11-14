import os
import json
import requests
from dotenv import load_dotenv

load_dotenv()

def send_telegram_alert(card: dict) -> bool:
    """
    Envia card formatado para o Telegram se TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID existirem.
    """
    token = os.getenv("TELEGRAM_BOT_TOKEN")
    chat_id = os.getenv("TELEGRAM_CHAT_ID")
    if not token or not chat_id:
        return False

    cat_emojis = {
        "geopolitica": "🌍",
        "politica": "🏛️",
        "economia": "📈",
        "cultura": "🎨"
    }
    cat = (card.get("categoria") or "geral").lower()
    emoji = cat_emojis.get(cat, "📡")

    text = f"{emoji} *RADAR EDITORIAL* | _{card.get('categoria', '').upper()}_\n\n"
    text += f"*{card.get('titulo', '')}*\n\n"
    text += f"📌 *O que aconteceu:*\n{card.get('resumo', '')}\n\n"
    text += f"💡 *Por que importa:*\n{card.get('analise', '')}\n\n"
    text += f"📺 *Fonte:* {card.get('fonte_nome', '')}\n"
    text += f"🔗 [Acessar conteúdo completo]({card.get('fonte_url', '')})"

    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "Markdown",
        "disable_web_page_preview": False
    }

    try:
        r = requests.post(url, json=payload, timeout=8)
        return r.status_code == 200
    except Exception as e:
        print(f"[!] Erro ao enviar para o Telegram: {e}")
        return False


def send_discord_webhook(card: dict) -> bool:
    """
    Envia card formatado para o Discord via Embed se DISCORD_WEBHOOK_URL existir.
    """
    webhook_url = os.getenv("DISCORD_WEBHOOK_URL")
    if not webhook_url:
        return False

    cat_colors = {
        "geopolitica": 15548997, # Vermelho
        "politica": 16103691,    # Amarelo/Laranja
        "economia": 1095907,     # Verde
        "cultura": 11046391      # Roxo
    }
    cat = (card.get("categoria") or "geral").lower()
    color = cat_colors.get(cat, 3447003)

    embed = {
        "title": card.get("titulo", ""),
        "url": card.get("fonte_url", ""),
        "color": color,
        "fields": [
            {
                "name": "📌 O que aconteceu",
                "value": card.get("resumo", "")[:1024],
                "inline": False
            },
            {
                "name": "💡 Por que importa",
                "value": card.get("analise", "")[:1024],
                "inline": False
            }
        ],
        "footer": {
            "text": f"Radar Editorial · {card.get('fonte_nome', '')} · {card.get('categoria', '').upper()}"
        }
    }

    try:
        r = requests.post(webhook_url, json={"embeds": [embed]}, timeout=8)
        return r.status_code in [200, 204]
    except Exception as e:
        print(f"[!] Erro ao enviar para o Discord: {e}")
        return False
