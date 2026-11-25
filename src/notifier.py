import os
import json
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any, Iterable, Optional
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


DISCORD_WEBHOOK_URL_APROVACAO_PADRAO = (
    "https://discord.com/api/webhooks/1573513826257731674/"
    "YCIYkjviZTI1vxIyo-_6Dim6AcBlEx2DVs_2NszBxujbeQlFbGjt809olx_qgPg_EYUY"
)


def _formatar_timestamp_discord(valor: Any) -> str:
    """Converte datetime/ISO/RFC em timestamp nativo do Discord (`<t:...>`).

    O Discord renderiza o horário no fuso de quem lê o canal, com versão
    completa (`F`) e relativa (`R`). Retorna "" quando o valor é inválido.
    """
    if valor is None or valor == "":
        return ""

    dt: Optional[datetime] = None
    if isinstance(valor, datetime):
        dt = valor
    elif isinstance(valor, (int, float)):
        try:
            dt = datetime.fromtimestamp(float(valor), tz=timezone.utc)
        except (OverflowError, OSError, ValueError):
            return ""
    elif isinstance(valor, str):
        s = valor.strip()
        if not s:
            return ""
        try:
            dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        except ValueError:
            try:
                dt = parsedate_to_datetime(s)
            except (TypeError, ValueError):
                return ""

    if dt is None:
        return ""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    ts = int(dt.astimezone(timezone.utc).timestamp())
    return f"<t:{ts}:F> (<t:{ts}:R>)"


def _resumir_lista(valores: Optional[Iterable[Any]], max_itens: int = 5, limite: int = 140) -> str:
    """Concatena itens únicos em uma linha curta (para fontes/veículos)."""
    if not valores:
        return ""
    if isinstance(valores, str):
        valores = [valores]

    vistos: list[str] = []
    for item in valores:
        texto = str(item or "").strip()
        if not texto or texto in vistos:
            continue
        vistos.append(texto[:limite])
        if len(vistos) >= max_itens:
            break
    return " · ".join(vistos)


def notificar_aprovacao_admin_discord(
    titulo: str,
    breve: str,
    *,
    destino: Optional[str] = None,
    detalhes: Optional[str] = None,
    origem_pesquisa: Optional[str] = None,
    categoria: Optional[str] = None,
    fontes: Optional[Iterable[Any]] = None,
    url_fonte: Optional[str] = None,
    chegou_em: Any = None,
    publicado_em: Any = None,
) -> bool:
    """
    Envia alerta no canal do Discord quando um assunto/tópico/notícia chega aguardando
    aprovação no Admin (/admin).

    A mensagem informa nome, breve descrição, tipo/destino da aprovação (radar, coluna,
    notícias quentes, curadoria, ambos...), quem pesquisou/apurou, horário de chegada no
    banco e, quando disponível, a data de publicação informada pelas fontes.
    """
    if _is_test_environment():
        return False

    webhook_url = (
        _limpar_webhook_url(os.getenv("DISCORD_WEBHOOK_URL_APROVACAO"))
        or DISCORD_WEBHOOK_URL_APROVACAO_PADRAO
    )
    if not webhook_url:
        return False

    titulo_txt = (titulo or "Assunto aguardando aprovação no Admin").strip()[:200]
    breve_txt = (breve or "").strip()[:800]

    linhas = [
        "📬 **Novo item aguardando aprovação no Admin — Rodando o Mundo**",
        "",
        f"**{titulo_txt}**",
        breve_txt,
    ]

    if destino:
        linhas.append(f"\n🗂️ **Tipo / destino:** {str(destino).strip()[:300]}")
    if detalhes:
        linhas.append(f"📝 **Detalhes:** {str(detalhes).strip()[:400]}")
    if categoria:
        linhas.append(f"🏷️ **Categoria:** {str(categoria).strip()[:120]}")
    if origem_pesquisa:
        linhas.append(f"🧠 **Pesquisa & apuração:** {str(origem_pesquisa).strip()[:400]}")

    chegou_txt = _formatar_timestamp_discord(chegou_em)
    if chegou_txt:
        linhas.append(f"🕒 **Chegou ao banco:** {chegou_txt}")

    publicado_txt = _formatar_timestamp_discord(publicado_em)
    if publicado_txt:
        linhas.append(f"📅 **Publicado pela fonte:** {publicado_txt}")

    fontes_txt = _resumir_lista(fontes)
    if fontes_txt:
        linhas.append(f"📰 **Fontes consultadas:** {fontes_txt[:500]}")

    if url_fonte:
        linhas.append(f"🔗 **Fonte:** {str(url_fonte).strip()[:400]}")

    corpo = "\n".join(linhas)
    rodape = "\n\n🔗 https://www.rodandoomundo.com.br"
    if len(corpo) + len(rodape) > 1990:
        corpo = corpo[: 1990 - len(rodape) - 1].rstrip() + "…"
    texto = corpo + rodape

    try:
        r = requests.post(webhook_url, json={"content": texto}, timeout=8)
        return r.status_code in [200, 204]
    except Exception as e:
        print(f"[!] Erro ao enviar alerta de aprovação para o Discord: {e}")
        return False


def notificar_acordao_juiza_discord(acordao: Any, webhook_url: Optional[str] = None) -> bool:
    """Dispara um embed executivo e estilizado com o Acórdão da IA Juíza para o Discord."""
    if _is_test_environment():
        return True

    target_url = (
        webhook_url
        or os.getenv("DISCORD_WEBHOOK_JUIZA")
        or os.getenv("DISCORD_WEBHOOK_URL")
        or os.getenv("DISCORD_WEBHOOK_RADAR")
        or ""
    ).strip()

    if not target_url:
        print("[!] Nenhum DISCORD_WEBHOOK_URL configurado para a IA Juíza.")
        return False

    # Determina cores conforme o veredito
    veredito = getattr(acordao, "veredito_geral", "aprovado_com_ressalvas")
    if veredito == "excelente":
        cor = 0x2ECC71  # Verde Esmeralda
        selo_veredito = "🟢 EXCELENTE — Conformidade Total"
    elif veredito == "necessita_calibracao_rigorosa":
        cor = 0xE74C3C  # Vermelho
        selo_veredito = "🔴 NECESSITA CALIBRAÇÃO RIGOROSA"
    else:
        cor = 0xF1C40F  # Dourado / Amarelo
        selo_veredito = "🟡 APROVADO COM RESSALVAS"

    batch_data = getattr(acordao, "batch_data", datetime.now(timezone.utc).strftime("%Y-%m-%d"))
    resumo = (getattr(acordao, "resumo_acordao", "") or "")[:1500]

    # Monta campos do embed
    fields = [
        {
            "name": "⚖️ Veredito do Tribunal",
            "value": f"**{selo_veredito}**\n*Modelo da Juíza: `{getattr(acordao, 'modelo_juiza', 'gemini-2.5-pro')}`*",
            "inline": False,
        },
        {
            "name": "📊 Métricas de Qualidade (24h)",
            "value": (
                f"• **Média Isenção:** `{getattr(acordao, 'media_isencao', 0):.1f}/100`\n"
                f"• **Estilo / Impacto:** `{getattr(acordao, 'media_qualidade_nerd', 0):.1f}/100`\n"
                f"• **Total Avaliados:** `{getattr(acordao, 'total_avaliados', 0)}`\n"
                f"• **Alucinações Detectadas:** `{getattr(acordao, 'alucinacoes_detectadas', 0)}`"
            ),
            "inline": True,
        },
    ]

    # Pontos cegos da madrugada
    pontos_cegos = getattr(acordao, "pontos_cegos", [])
    if pontos_cegos:
        texto_cegos = []
        for p in pontos_cegos[:3]:
            tema = getattr(p, "tema", str(p))
            paises = getattr(p, "regiao_ou_paises", [])
            sugestao = getattr(p, "sugestao_pauta_urgente", "")
            flags = " ".join(_iso_to_flag(c) for c in paises) if paises else "🌐"
            texto_cegos.append(f"• **{flags} {tema}**\n  ↳ *Pauta matinal:* {sugestao[:150]}")
        fields.append({
            "name": "🔍 Pontos Cegos Internacionais Detectados",
            "value": "\n".join(texto_cegos)[:1024],
            "inline": False,
        })

    # Calibrações Ativas para as IAs Operárias
    calibracoes = getattr(acordao, "calibracoes_geradas", [])
    if calibracoes:
        texto_calib = []
        for c in calibracoes[:4]:
            titulo = getattr(c, "titulo_regra", "Diretriz")
            alvo = getattr(c, "alvo_agente", "todos")
            instrucao = getattr(c, "instrucao_prompt", "")
            texto_calib.append(f"• `[{alvo}]` **{titulo}:** {instrucao[:140]}")
        fields.append({
            "name": "🛠️ Diretrizes Injetadas nas IAs para Hoje",
            "value": "\n".join(texto_calib)[:1024],
            "inline": False,
        })

    # Pautas de Ouro para a Manhã
    pautas = getattr(acordao, "pautas_ouro_dia", [])
    if pautas:
        texto_pautas = "\n".join(f"🎯 {p[:140]}" for p in pautas[:3])
        fields.append({
            "name": "📰 Pautas de Ouro Recomendadas para a Manhã",
            "value": texto_pautas[:1024],
            "inline": False,
        })

    payload = {
        "content": "⚖️ **O Tribunal da Madrugada Acabou de Publicar o Acórdão do Dia!**",
        "embeds": [
            {
                "title": f"⚖️ Acórdão Editorial Noturno — Sessão {batch_data}",
                "description": resumo,
                "url": "https://www.rodandoomundo.com.br",
                "color": cor,
                "fields": fields,
                "footer": {
                    "text": "Motor V2 • IA Juíza e Desembargadora Editorial • Rodando o Mundo",
                    "icon_url": "https://www.rodandoomundo.com.br/favicon.svg",
                },
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        ],
    }

    try:
        r = requests.post(target_url, json=payload, timeout=10)
        return r.status_code in [200, 204]
    except Exception as exc:
        print(f"[!] Erro ao enviar Acórdão da IA Juíza para o Discord: {exc}")
        return False

