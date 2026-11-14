"""Motor de coleta: RSS editoriais + config/sources.json + Google Trends BR, com limpeza de HTML e janela temporal."""
import json
import re
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, List

import feedparser
import requests
from bs4 import BeautifulSoup

from .fontes import FEEDS_RSS_RODANDO_O_MUNDO, GOOGLE_TRENDS_RSS, USER_AGENT

SOURCES_JSON_PATH = Path(__file__).resolve().parents[2] / "config" / "sources.json"

MAPA_CATEGORIA_SOURCES = {
    "politica": "Politica",
    "economia": "Economia",
    "cultura": "Cultura",
    "eleicoes": "Eleicoes",
    "geopolitica": "Geopolitica_Radar",
}


def carregar_feeds_sources_json() -> Dict[str, List[str]]:
    """Lê as fontes do tipo 'rss' de config/sources.json para unificar com os feeds da curadoria."""
    extras: Dict[str, List[str]] = {}
    if not SOURCES_JSON_PATH.exists():
        return extras
    try:
        dados = json.loads(SOURCES_JSON_PATH.read_text(encoding="utf-8"))
        for item in dados:
            if str(item.get("tipo", "")).lower() != "rss":
                continue
            url = str(item.get("id_ou_url", "")).strip()
            if not url:
                continue
            cat_raw = str(item.get("categoria", "")).lower().strip()
            nicho = MAPA_CATEGORIA_SOURCES.get(cat_raw, "Resumo_Ultimas")
            extras.setdefault(nicho, [])
            if url not in extras[nicho]:
                extras[nicho].append(url)
    except Exception as e:  # noqa: BLE001
        print(f"[Aviso] Não foi possível ler {SOURCES_JSON_PATH}: {e}")
    return extras


def limpar_html(texto_sujo: str, limite: int = 450) -> str:
    if not texto_sujo:
        return ""
    texto = BeautifulSoup(texto_sujo, "html.parser").get_text(separator=" ")
    return re.sub(r"\s+", " ", texto).strip()[:limite]


def dentro_da_janela_tempo(entry, horas_limite: int = 12) -> bool:
    pub = getattr(entry, "published_parsed", None)
    if not pub:
        return True
    data_pub = datetime.fromtimestamp(time.mktime(pub), tz=timezone.utc)
    return data_pub >= datetime.now(timezone.utc) - timedelta(hours=horas_limite)


def coletar_feeds_rss(horas_limite: int = 12, por_feed: int = 10) -> List[Dict]:
    itens: List[Dict] = []
    vistos = set()
    urls_vistas = set()
    headers = {"User-Agent": USER_AGENT}

    feeds_combinados: Dict[str, List[str]] = {k: list(v) for k, v in FEEDS_RSS_RODANDO_O_MUNDO.items()}
    for nicho, lista_urls in carregar_feeds_sources_json().items():
        feeds_combinados.setdefault(nicho, [])
        for u in lista_urls:
            if u not in feeds_combinados[nicho]:
                feeds_combinados[nicho].append(u)

    for nicho, urls in feeds_combinados.items():
        for url in urls:
            if url in urls_vistas:
                continue
            urls_vistas.add(url)
            try:
                resp = requests.get(url, headers=headers, timeout=10)
                feed = feedparser.parse(resp.content)
                for entry in feed.entries[:por_feed]:
                    titulo = limpar_html(entry.get("title", ""))
                    chave = titulo.lower()
                    if not titulo or chave in vistos or not dentro_da_janela_tempo(entry, horas_limite):
                        continue
                    vistos.add(chave)
                    itens.append({
                        "origem": f"RSS - {nicho}",
                        "fonte": feed.feed.get("title", url),
                        "titulo": titulo,
                        "resumo": limpar_html(entry.get("summary", entry.get("description", ""))),
                        "link": entry.get("link", ""),
                    })
            except Exception as e:  # noqa: BLE001 - feed individual não pode derrubar o pipeline
                print(f"[Aviso] Falha ao ler feed {url}: {e}")
    return itens


def coletar_google_trends(limite: int = 15) -> List[Dict]:
    tendencias: List[Dict] = []
    try:
        feed = feedparser.parse(GOOGLE_TRENDS_RSS, agent=USER_AGENT)
        for entry in feed.entries[:limite]:
            termo = limpar_html(entry.get("title", ""))
            trafego = entry.get("ht_approx_traffic", "Alta")
            noticia = limpar_html(entry.get("ht_news_item_title", ""))
            tendencias.append({
                "origem": "Google Trends (Buscas em Alta)",
                "fonte": "Google Trends BR",
                "titulo": f"Termo em alta: {termo} (Volume: {trafego})",
                "resumo": f"Contexto associado nas buscas: {noticia}" if noticia else "Pico repentino de pesquisas no Brasil.",
                "link": entry.get("link", ""),
            })
    except Exception as e:  # noqa: BLE001
        print(f"[Aviso] Falha ao coletar Google Trends: {e}")
    return tendencias

