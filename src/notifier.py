import os
import json
from datetime import datetime, timezone
from typing import Optional
import requests
from dotenv import load_dotenv

load_dotenv()


def _is_test_environment() -> bool:
    """Impede disparo real de webhooks durante execuções automatizadas de testes (pytest)."""
    if os.getenv("PYTEST_CURRENT_TEST"):
        return True
    return os.getenv("ROM_DISABLE_NOTIFICATIONS", "").strip().lower() in ("1", "true", "yes")


def _iso_to_flag(code: str) -> str:
    """Converte sigla ISO-3166-1 alpha-2 (ex: BR, US) em emoji de bandeira."""
    c = (code or "").strip().upper()
    if len(c) == 2 and c.isalpha():
        return "".join(chr(0x1F1E6 + ord(ch) - ord("A")) for ch in c)
    return ""


def _formatar_pais_regiao(card: dict) -> str:
    """Monta texto legível de país/região a partir dos metadados disponíveis no card."""
    continentes = {
        "sul": "América do Sul",
        "norte": "América do Norte",
        "europa": "Europa",
        "asia": "Ásia",
        "africa": "África",
        "oceania": "Oceania",
    }
    codigo = (card.get("codigoPais") or "").strip().upper()
    pais = (card.get("pais") or "").strip()
    paises_lista = card.get("paises_envolvidos")
    continente_id = (card.get("continente") or "").strip().lower()
    continente_nome = continentes.get(continente_id, "")

    partes = []
    if pais:
        bandeira = _iso_to_flag(codigo)
        partes.append(f"{bandeira} {pais}".strip())
    elif isinstance(paises_lista, list) and paises_lista:
        formatados = []
        for p in paises_lista[:3]:
            p_str = str(p).strip()
            if not p_str:
                continue
            flag = _iso_to_flag(p_str)
            formatados.append(f"{flag} {p_str}".strip() if flag else p_str)
        if formatados:
            partes.append(", ".join(formatados))
    elif codigo:
        flag = _iso_to_flag(codigo)
        partes.append(f"{flag} {codigo}".strip())

    if continente_nome:
        partes.append(continente_nome)

    return " · ".join(partes)


def _formatar_topicos(card: dict) -> str:
    """Formata lista de tópicos ou palavras-chave em hashtags curtas para o Discord."""
    raw = card.get("topicosEmAlta") or card.get("palavras_chave") or []
    if not isinstance(raw, list):
        return ""
    tags = []
    for item in raw[:5]:
        limpo = str(item or "").strip().lstrip("#")
        if limpo:
            tags.append(f"#{limpo.replace(' ', '_')}")
    return " ".join(tags)


def _formatar_cobertura(card: dict) -> str:
    """Formata indicador de relevância/urgência e motor de apuração."""
    partes = []
    rel = card.get("relevancia") or card.get("relevancia_score")
    urg = card.get("urgencia_score")
    if rel is not None:
        try:
            rel_int = int(rel)
            escala = "10" if rel_int <= 10 else "100"
            nivel = "Alta" if (rel_int <= 3 if escala == "10" else rel_int >= 75) else "Moderada"
            partes.append(f"Relevância {nivel} ({rel_int}/{escala})")
        except (TypeError, ValueError):
            pass
    elif urg is not None:
        try:
            urg_int = int(urg)
            partes.append(f"Urgência {urg_int}/100")
        except (TypeError, ValueError):
            pass

    motor = (card.get("fonteMotor") or "").strip()
    if motor:
        partes.append(motor)
    return " · ".join(partes)


def _normalizar_timestamp_iso(raw_ts: Optional[str]) -> Optional[str]:
    """Valida/normaliza timestamp para formato ISO-8601 UTC aceito pelo Discord."""
    if not raw_ts or not isinstance(raw_ts, str):
        return None
    s = raw_ts.strip()
    if not s:
        return None
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).isoformat()
    except ValueError:
        return None


def send_telegram_alert(card: dict) -> bool:
    """
    Envia card formatado para o Telegram se TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID existirem.
    """
    if _is_test_environment():
        return False

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

    resumo = card.get("resumo") or card.get("resumo_pulso") or card.get("subtitulo") or ""
    analise = card.get("analise") or card.get("contexto") or card.get("impacto_pratico") or ""
    pais_regiao = _formatar_pais_regiao(card)
    topicos = _formatar_topicos(card)

    text = f"{emoji} *RADAR EDITORIAL* | _{card.get('categoria', '').upper()}_\n\n"
    text += f"*{card.get('titulo', '')}*\n\n"
    text += f"📌 *O que aconteceu:*\n{resumo}\n\n"
    text += f"💡 *Por que importa:*\n{analise}\n\n"
    if pais_regiao:
        text += f"🌐 *País/Região:* {pais_regiao}\n"
    if topicos:
        text += f"🏷️ *Tópicos:* {topicos}\n"
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
    Envia card formatado e explicativo para o Discord via Embed no canal correspondente.
    """
    if _is_test_environment():
        return False

    webhook_url = get_discord_webhook_url(canal)
    if not webhook_url:
        return False

    cat_colors = {
        "geopolitica": 15548997, # Vermelho
        "politica": 16103691,    # Amarelo/Laranja
        "economia": 1095907,     # Verde
        "cultura": 11046391      # Roxo
    }
    cat_emojis = {
        "geopolitica": "🌍",
        "politica": "🏛️",
        "economia": "📈",
        "cultura": "🎨"
    }
    cat = (card.get("categoria") or "geral").strip().lower()
    cat_label = (card.get("categoria") or "Geral").strip().upper()
    color = cat_colors.get(cat, 3447003)
    emoji = cat_emojis.get(cat, "📡")

    selo_canal = "Editorial & Curadoria" if canal == "editorial" else "Radar Editorial"
    titulo = (card.get("titulo") or "Atualização Editorial").strip()[:256]
    fonte_nome = (card.get("fonte_nome") or card.get("fonte") or "Redação RoM").strip()
    fonte_url = (card.get("fonte_url") or card.get("url") or "").strip()

    resumo = (
        card.get("resumo")
        or card.get("resumo_pulso")
        or card.get("subtitulo")
        or "Síntese factual em atualização."
    ).strip()
    analise = (
        card.get("analise")
        or card.get("contexto")
        or card.get("impacto_pratico")
        or "Impacto e desdobramentos em apuração."
    ).strip()

    fields = [
        {
            "name": "📌 O que aconteceu (Fato Central)",
            "value": resumo[:1024],
            "inline": False
        },
        {
            "name": "💡 Por que importa (Impacto & Cenário)",
            "value": analise[:1024],
            "inline": False
        }
    ]

    pais_regiao = _formatar_pais_regiao(card)
    if pais_regiao:
        fields.append({
            "name": "🌐 País & Região",
            "value": pais_regiao[:1024],
            "inline": True
        })

    topicos = _formatar_topicos(card)
    if topicos:
        fields.append({
            "name": "🏷️ Tópicos em Alta",
            "value": topicos[:1024],
            "inline": True
        })

    cobertura = _formatar_cobertura(card)
    if cobertura:
        fields.append({
            "name": "⚡ Cobertura & Relevância",
            "value": cobertura[:1024],
            "inline": False
        })

    if fonte_url:
        fields.append({
            "name": "🔗 Fonte Verificada",
            "value": f"[{fonte_nome}]({fonte_url})"[:1024],
            "inline": False
        })

    embed = {
        "author": {
            "name": f"{emoji} {selo_canal.upper()} · {cat_label}"
        },
        "title": titulo,
        "color": color,
        "fields": fields,
        "footer": {
            "text": f"{selo_canal} · {fonte_nome} · {cat_label}"
        }
    }
    if fonte_url:
        embed["url"] = fonte_url

    ts_iso = _normalizar_timestamp_iso(card.get("data_publicacao") or card.get("published_at"))
    if ts_iso:
        embed["timestamp"] = ts_iso

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
    if _is_test_environment():
        return False

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
