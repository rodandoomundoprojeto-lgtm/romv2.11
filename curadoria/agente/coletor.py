"""Motor de coleta: RSS editoriais + config/sources.json + Google Trends BR, com limpeza de HTML e janela temporal."""
import calendar
import json
import re
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

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


def extrair_data_publicacao_entry(entry: Any) -> Optional[datetime]:
    """Extrai a data de publicação UTC de um item RSS/Atom (retorna None se ausente/inválida)."""
    for attr in ("published_parsed", "updated_parsed"):
        pub = entry.get(attr) if isinstance(entry, dict) else getattr(entry, attr, None)
        if not pub:
            continue
        try:
            if isinstance(pub, tuple) or hasattr(pub, "tm_year"):
                seq = tuple(pub)
                if len(seq) >= 6:
                    if len(seq) < 9:
                        seq = seq + (0,) * (9 - len(seq))
                    return datetime.fromtimestamp(calendar.timegm(seq[:9]), tz=timezone.utc)
        except Exception:
            pass

    for attr in ("published", "updated", "pubDate", "data_publicacao"):
        raw = entry.get(attr) if isinstance(entry, dict) else getattr(entry, attr, None)
        if isinstance(raw, str) and raw.strip():
            texto = raw.strip()
            try:
                dt = datetime.fromisoformat(texto.replace("Z", "+00:00"))
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                return dt.astimezone(timezone.utc)
            except Exception:
                pass
            try:
                dt = parsedate_to_datetime(texto)
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                return dt.astimezone(timezone.utc)
            except Exception:
                pass
    return None


def dentro_da_janela_tempo(entry, horas_limite: int = 12) -> bool:
    data_pub = extrair_data_publicacao_entry(entry)
    if data_pub is None:
        return False
    agora = datetime.now(timezone.utc)
    return data_pub >= agora - timedelta(hours=horas_limite)


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
                entries_validas: List[Tuple[datetime, Any]] = []
                for entry in (feed.entries or []):
                    if not dentro_da_janela_tempo(entry, horas_limite):
                        continue
                    data_pub = extrair_data_publicacao_entry(entry)
                    if data_pub is not None:
                        entries_validas.append((data_pub, entry))

                entries_validas.sort(key=lambda pair: pair[0], reverse=True)

                for data_pub, entry in entries_validas[:por_feed]:
                    titulo = limpar_html(entry.get("title", ""))
                    chave = titulo.lower()
                    if not titulo or chave in vistos:
                        continue
                    vistos.add(chave)
                    itens.append({
                        "origem": f"RSS - {nicho}",
                        "fonte": feed.feed.get("title", url),
                        "titulo": titulo,
                        "resumo": limpar_html(entry.get("summary", entry.get("description", ""))),
                        "link": entry.get("link", ""),
                        "data_publicacao": data_pub.strftime("%Y-%m-%dT%H:%M:%SZ"),
                    })
            except Exception as e:  # noqa: BLE001 - feed individual não pode derrubar o pipeline
                print(f"[Aviso] Falha ao ler feed {url}: {e}")

    itens.sort(key=lambda it: str(it.get("data_publicacao") or ""), reverse=True)
    return itens


def coletar_google_trends(limite: int = 15) -> List[Dict]:
    tendencias: List[Dict] = []
    try:
        feed = feedparser.parse(GOOGLE_TRENDS_RSS, agent=USER_AGENT)
        for entry in (feed.entries or [])[:limite]:
            termo = limpar_html(entry.get("title", ""))
            trafego = entry.get("ht_approx_traffic", "Alta")
            noticia = limpar_html(entry.get("ht_news_item_title", ""))
            data_pub = extrair_data_publicacao_entry(entry)
            tendencias.append({
                "origem": "Google Trends (Buscas em Alta)",
                "fonte": "Google Trends BR",
                "titulo": f"Termo em alta: {termo} (Volume: {trafego})",
                "resumo": f"Contexto associado nas buscas: {noticia}" if noticia else "Pico repentino de pesquisas no Brasil.",
                "link": entry.get("link", ""),
                "data_publicacao": data_pub.strftime("%Y-%m-%dT%H:%M:%SZ") if data_pub else None,
            })
    except Exception as e:  # noqa: BLE001
        print(f"[Aviso] Falha ao coletar Google Trends: {e}")
    return tendencias


NOTICIAS_DDG_JSON_PATH = Path(__file__).resolve().parents[2] / "data" / "noticias_ddg.json"


def coletar_noticias_ddg_news(limite: int = 15) -> List[Dict]:
    """Coleta notícias recentes geradas pelo Bot DuckDuckGo News (`ddgs`)."""
    itens_ddg: List[Dict] = []
    if not NOTICIAS_DDG_JSON_PATH.exists():
        return itens_ddg
    try:
        dados = json.loads(NOTICIAS_DDG_JSON_PATH.read_text(encoding="utf-8"))
        if not isinstance(dados, dict):
            return itens_ddg
        for it in (dados.get("items") or [])[:limite]:
            if not isinstance(it, dict):
                continue
            titulo = limpar_html(it.get("titulo", ""))
            if not titulo:
                continue
            resumo = limpar_html(it.get("resumo", ""))
            itens_ddg.append({
                "origem": "DuckDuckGo News (ddgs)",
                "fonte": it.get("fonte") or "DuckDuckGo News",
                "titulo": titulo,
                "resumo": resumo,
                "link": it.get("url") or "",
                "data_publicacao": it.get("publicadoEm") or dados.get("atualizadoEm"),
                "categoria_sugerida": it.get("categoria") or it.get("categoriaRadar") or "Geopolitica_Radar",
                "pais": it.get("codigoPais") or "BR",
            })
    except Exception as e:  # noqa: BLE001
        print(f"[Aviso] Falha ao coletar notícias do DuckDuckGo News: {e}")
    return itens_ddg

