import os
import json
from typing import Optional
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


def _limpar_webhook_url(url: Optional[str]) -> str:
    """Retorna a URL apenas se for um webhook completo do Discord (ignora prefixos vazios)."""
    u = (url or "").strip()
    if not u or u == "https://discord.com/api/webhooks/" or len(u) < 45:
        return ""
    return u


def get_discord_webhook_url(canal: str = "radar") -> str:
    """
    Retorna a URL do webhook específica do canal solicitado com fallback para DISCORD_WEBHOOK_URL geral.
    Canais suportados: 'critico', 'manutencao', 'editorial', 'radar'.
    """
    canal_map = {
        "critico": os.getenv("DISCORD_WEBHOOK_CRITICO"),
        "manutencao": os.getenv("DISCORD_WEBHOOK_MANUTENCAO"),
        "editorial": os.getenv("DISCORD_WEBHOOK_EDITORIAL"),
        "radar": os.getenv("DISCORD_WEBHOOK_RADAR"),
    }
    especifico = _limpar_webhook_url(canal_map.get(canal))
    geral = _limpar_webhook_url(os.getenv("DISCORD_WEBHOOK_URL"))
    return especifico or geral


def send_discord_webhook(card: dict, canal: str = "radar") -> bool:
    """
    Envia card formatado para o Discord via Embed no canal correspondente (ou canal geral).
    """
    webhook_url = get_discord_webhook_url(canal)
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

    selo_canal = "Editorial & Curadoria" if canal == "editorial" else "Radar Editorial"
    embed = {
        "title": card.get("titulo", ""),
        "url": card.get("fonte_url", ""),
        "color": color,
        "fields": [
            {
                "name": "📌 O que aconteceu",
                "value": (card.get("resumo") or "")[:1024],
                "inline": False
            },
            {
                "name": "💡 Por que importa",
                "value": (card.get("analise") or "")[:1024],
                "inline": False
            }
        ],
        "footer": {
            "text": f"{selo_canal} · {card.get('fonte_nome', '')} · {card.get('categoria', '').upper()}"
        }
    }

    try:
        r = requests.post(webhook_url, json={"embeds": [embed]}, timeout=8)
        return r.status_code in [200, 204]
    except Exception as e:
        print(f"[!] Erro ao enviar para o Discord ({canal}): {e}")
        return False


def send_discord_system_alert(
    titulo: str,
    descricao: str,
    nivel: str = "info",
    canal_override: Optional[str] = None,
) -> bool:
    """
    Envia alertas do sistema (SRE, manutenção, erros críticos, editorial).
    nivel: 'critico' (vermelho), 'aviso' (amarelo), 'sucesso' (verde), 'info' (azul).
    """
    canal = canal_override or ("critico" if nivel == "critico" else "manutencao")
    webhook_url = get_discord_webhook_url(canal)
    if not webhook_url:
        return False

    cores = {
        "critico": 15158332, # Vermelho escuro
        "aviso": 16776960,   # Amarelo
        "sucesso": 3066993,  # Verde
        "info": 3447003      # Azul
    }

    payload = {
        "embeds": [{
            "title": titulo,
            "description": descricao[:4096],
            "color": cores.get(nivel, 3447003)
        }]
    }

    # Se for crítico, pode marcar @here se configurado
    ping_critico = os.getenv("DISCORD_PING_ON_CRITICAL", "").strip().lower() in ("true", "1", "yes")
    if nivel == "critico" and ping_critico:
        payload["content"] = "@here 🚨 **Atenção: Falha crítica detectada no sistema!**"

    try:
        r = requests.post(webhook_url, json=payload, timeout=8)
        return r.status_code in [200, 204]
    except Exception as e:
        print(f"[!] Erro ao enviar alerta para Discord ({canal}): {e}")
        return False
